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
from app.schemas.generation import GenerationJobOut, VideoOutputOut
from app.services import generation_service

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
