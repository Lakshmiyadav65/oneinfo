import asyncio
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.creator import Creator
from app.models.generation_job import GenerationJob
from app.providers.storage import get_storage_provider
from app.schemas.export import ExportRequest
from app.schemas.generation import (
    GenerationJobOut,
    SceneTakeOut,
    SceneTakesOut,
    SceneVoiceOut,
    StitchReadinessOut,
    VideoOutputOut,
)
from app.services import generation_service, voice_service

router = APIRouter(prefix="/projects/{project_id}", tags=["generation"])


@router.post("/generate", response_model=GenerationJobOut)
async def start_generation(
    project_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> GenerationJob:
    job, is_new = await generation_service.start_generation(db, settings, creator.id, project_id)
    if is_new:
        background_tasks.add_task(generation_service.run_generation_job, job.id)
    return job


@router.get("/generation", response_model=GenerationJobOut)
async def get_generation(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> GenerationJob:
    return await generation_service.get_generation_status(db, creator.id, project_id)


@router.get("/output", response_model=VideoOutputOut)
async def get_output(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> VideoOutputOut:
    output = await generation_service.get_video_output(db, creator.id, project_id)
    storage = get_storage_provider(settings)
    url = storage.get_url(output.storage_key) or f"/projects/{project_id}/output/file"
    return VideoOutputOut(
        id=output.id,
        mime_type=output.mime_type,
        duration_seconds=output.duration_seconds,
        file_size_bytes=output.file_size_bytes,
        url=url,
    )


@router.get("/output/file")
async def download_output(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    Streams the stored file for providers that can't hand back a direct
    URL (local dev storage). Reads the whole file into memory — acceptable
    for MVP clip lengths; GCSStorageProvider returns a signed URL instead
    and this route is never hit once STORAGE_BACKEND=gcs.
    """
    output = await generation_service.get_video_output(db, creator.id, project_id)
    storage = get_storage_provider(settings)
    content = await asyncio.to_thread(storage.read, output.storage_key)
    return Response(content=content, media_type=output.mime_type)


@router.post("/storyboard/scenes/{scene_id}/generate", response_model=GenerationJobOut)
async def start_scene_generation(
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> GenerationJob:
    """
    Renders one scene on its own, so a creator can see how it looks before
    paying for the rest of the video.
    """
    job, is_new = await generation_service.start_generation(
        db, settings, creator.id, project_id, scene_id=scene_id
    )
    if is_new:
        background_tasks.add_task(generation_service.run_generation_job, job.id)
    return job


@router.get("/stitch", response_model=StitchReadinessOut)
async def get_stitch_readiness(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> StitchReadinessOut:
    """
    Whether the clips on hand can be combined into a finished video.

    Asked before the button is offered rather than after it is pressed: a
    creator one scene short should be told which scene, not handed a refusal
    once they have committed.
    """
    ready, missing = await generation_service.get_stitch_readiness(
        db, creator.id, project_id
    )
    return StitchReadinessOut(
        scenes_total=ready + len(missing), scenes_ready=ready, missing_scenes=missing
    )


@router.post("/stitch", response_model=GenerationJobOut)
async def start_stitch(
    project_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> GenerationJob:
    """
    Combines the clips already generated into the finished video.

    Calls the video provider zero times, so it costs nothing. Without it the
    only route to a finished video was a full run that regenerated and
    re-billed every scene, including the ones already paid for one at a time.
    """
    job, is_new = await generation_service.start_stitch(db, creator.id, project_id)
    if is_new:
        background_tasks.add_task(generation_service.run_generation_job, job.id)
    return job


@router.post("/export", response_model=GenerationJobOut)
async def export_video(
    project_id: uuid.UUID,
    request: ExportRequest,
    background_tasks: BackgroundTasks,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> GenerationJob:
    """
    The finished video again, framed for wherever it is going next.

    The same free stitch as combining, so exporting the same cut for three
    platforms costs nothing: the clips have already been paid for and no
    request reaches the video provider.

    The frame is recorded against this run and not against the project. A
    creator exporting for YouTube is saying where this file is going, not
    changing what their next scene is generated as.
    """
    job, is_new = await generation_service.start_stitch(
        db, creator.id, project_id, export=request
    )
    if is_new:
        background_tasks.add_task(generation_service.run_generation_job, job.id)
    return job


@router.get("/scenes/{scene_id}/file")
async def download_scene(
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    take: int | None = None,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    The most recently generated clip for one scene.

    `take` picks one of several takes from the same run. Omitted, it serves
    the take the final video will actually use.

    Serves the voiced clip where one exists, because that is the clip the
    final video is built from. Playing the raw one here would have the
    creator approving Veo's synthetic reading and exporting a different one.
    """
    asset = await generation_service.get_scene_asset(
        db, creator.id, project_id, scene_id, take, prefer_voiced=True
    )
    storage = get_storage_provider(settings)
    content = await asyncio.to_thread(storage.read, asset.storage_key)
    return Response(content=content, media_type=asset.mime_type)


@router.get("/scenes/{scene_id}/takes", response_model=SceneTakesOut)
async def get_scene_takes(
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> SceneTakesOut:
    """Which clips exist for this scene, and which one is in use."""
    takes = await generation_service.list_scene_takes(db, creator.id, project_id, scene_id)
    scene = await generation_service.get_scene(db, creator.id, project_id, scene_id)
    return SceneTakesOut(
        takes=[SceneTakeOut.model_validate(asset) for asset in takes],
        selected_take=scene.selected_take,
    )


@router.post("/scenes/{scene_id}/takes/{take}", response_model=SceneTakesOut)
async def select_scene_take(
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    take: int,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> SceneTakesOut:
    """
    Picks the take this scene contributes to the final video.

    Costs nothing and is reversible: the finished video is only rebuilt when
    the creator asks for it.
    """
    scene = await generation_service.select_scene_take(
        db, creator.id, project_id, scene_id, take
    )
    takes = await generation_service.list_scene_takes(db, creator.id, project_id, scene_id)
    return SceneTakesOut(
        takes=[SceneTakeOut.model_validate(asset) for asset in takes],
        selected_take=scene.selected_take,
    )


@router.post("/scenes/{scene_id}/voice", response_model=SceneVoiceOut)
async def voice_scene(
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SceneVoiceOut:
    """
    Says this scene's line over the clip it already has, replacing the voice
    Veo generated.

    Calls the video provider zero times, so trying a different voice or a
    reworded line never means paying to generate the picture again.
    """
    result = await voice_service.voice_scene(
        db, settings, creator.id, project_id, scene_id
    )
    return SceneVoiceOut(
        clip_seconds=result.clip_seconds,
        spoken_seconds=result.spoken_seconds,
        pace=result.pace,
        overruns=result.overruns,
        overrun_seconds=result.overrun_seconds,
    )
