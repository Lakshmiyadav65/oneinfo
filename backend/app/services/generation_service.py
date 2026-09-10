import asyncio
import tempfile
import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings, get_settings
from app.core.errors import AppError, NotFoundError, ValidationAppError
from app.db.base import get_session_factory
from app.models.asset import Asset, AssetType
from app.models.creator import Creator
from app.models.generation_job import GenerationJob, JobStatus
from app.models.project import Project, ProjectStatus
from app.models.storyboard import Storyboard, StoryboardScene
from app.models.video_output import VideoOutput
from app.providers.ffmpeg_runner import FFmpegError, probe_duration_seconds
from app.providers.storage import get_storage_provider
from app.providers.video import get_supported_durations, get_video_provider
from app.providers.video.base import (
    VideoGenerationRequest,
    VideoProvider,
    snap_duration,
)
from app.schemas.output_settings import ModelTier
from app.services import creator_face_service, project_service
from app.services.project_service import output_size, project_output_settings
from app.services.rendering_service import render_final_video


class GenerationError(AppError):
    code = "GENERATION_FAILED"
    status_code = 500


def _describe_failure(exc: Exception, stage: str | None) -> tuple[str, str]:
    """
    Splits a failure into the sentence the creator reads and the raw text
    kept for diagnosis.

    Worth separating because the raw text is not something to put in front
    of someone: Veo refuses a clip with a dict, ffmpeg with four lines of
    filter graph, and some exceptions stringify to nothing at all - which
    reached the creator as an error box with no words in it, which is how
    this was found.
    """
    raw = str(exc).strip()
    detail = f"{type(exc).__name__}: {raw}" if raw else type(exc).__name__

    if isinstance(exc, FFmpegError):
        return (
            "Every scene generated, but stitching them into the final video "
            "failed. Note that starting again re-generates all of the scenes "
            "and bills for them again - the saved clips are not reused - so "
            "this is worth reporting rather than retrying blind.",
            detail,
        )
    if isinstance(exc, GenerationError) and raw:
        # Already written for a person - either our own message, or the
        # provider explaining why it refused the clip.
        return raw, detail
    # Anything else is a bug or an outage, and naming the stage is the only
    # useful thing we can say about it.
    where = f" while {stage[0].lower()}{stage[1:]}" if stage else ""
    return (
        f"Video generation stopped unexpectedly{where}. Try starting it again - "
        "if it keeps failing, the technical details below are what to report.",
        detail,
    )


async def _get_latest_job(db: AsyncSession, project_id: uuid.UUID) -> GenerationJob | None:
    result = await db.execute(
        select(GenerationJob)
        .where(GenerationJob.project_id == project_id)
        .order_by(GenerationJob.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def start_generation(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID | None = None,
) -> tuple[GenerationJob, bool]:
    """Returns (job, is_new) — is_new tells the caller whether to actually
    dispatch a worker; a returned in-flight job must never be re-dispatched."""
    project = await project_service.get_owned_project(db, creator_id, project_id)

    result = await db.execute(
        select(Storyboard)
        .where(Storyboard.project_id == project.id)
        .options(selectinload(Storyboard.scenes))
    )
    storyboard = result.scalar_one_or_none()
    if storyboard is None or not storyboard.scenes:
        raise ValidationAppError("Generate a storyboard before starting video generation.")

    # A single-scene job validates and bills only that scene.
    target_scenes = storyboard.scenes
    if scene_id is not None:
        target_scenes = [s for s in storyboard.scenes if s.id == scene_id]
        if not target_scenes:
            raise NotFoundError("No such scene in this storyboard.")

    # Check every scene up front. Scenes are generated one at a time and
    # each finished one is billed, so a storyboard the provider will reject
    # halfway through costs real money before it fails. Storyboards saved
    # before durations were snapped can still be stored this way.
    # Snap any scene the provider would refuse, rather than refusing the run.
    # Storyboards saved before a constraint was known - or before the creator
    # was toggled on camera - can hold a length that is now illegal, and
    # sending someone back to regenerate a storyboard they are happy with is
    # a poor trade for a change we can make correctly ourselves.
    for scene in target_scenes:
        # On-camera scenes are bound by the tighter reference-to-video limit.
        allowed = get_supported_durations(settings, with_reference=scene.features_creator)
        fixed = snap_duration(scene.duration_seconds, allowed)
        if fixed != scene.duration_seconds:
            scene.duration_seconds = fixed

    # A scene can only put the creator on camera if they have both uploaded
    # a reference photo and agreed to their likeness being used. Checked here
    # rather than mid-job so the refusal is immediate and costs nothing.
    if any(scene.features_creator for scene in target_scenes):
        creator = await db.get(Creator, creator_id)
        if creator is None:
            raise NotFoundError("Creator not found.")
        creator_face_service.require_consent(creator)
        if not await creator_face_service.list_faces(db, creator_id):
            raise ValidationAppError(
                "This storyboard puts you on camera, but you haven't uploaded a "
                "reference photo yet. Add one in Settings, or turn off the "
                "on-camera scenes."
            )

    # Idempotency: repeated clicks return the in-flight job instead of
    # starting another expensive generation.
    existing = await _get_latest_job(db, project.id)
    if existing is not None and existing.status in (JobStatus.queued, JobStatus.processing):
        return existing, False

    job = GenerationJob(
        project_id=project.id,
        creator_id=creator_id,
        scene_id=scene_id,
        status=JobStatus.queued,
    )
    db.add(job)
    # A one-scene preview is not the project being generated - it must not
    # move the project's status or the workflow jumps a step ahead of itself.
    if scene_id is None:
        project.status = ProjectStatus.generating
    await db.commit()
    await db.refresh(job)
    return job, True


async def _existing_clip(
    db: AsyncSession, scene: StoryboardScene, take: int | None = None
) -> Asset | None:
    """
    The clip on hand for one scene, or None.

    Falls back to take 0 when the picked take is missing, for the same reason
    get_scene_asset does: clips generated before takes existed all carry
    index 0, and a scene pointing at a take that run never produced still has
    a perfectly good clip sitting there.
    """
    wanted = scene.selected_take if take is None else take
    for candidate in (wanted, 0):
        result = await db.execute(
            select(Asset)
            .where(
                Asset.scene_id == scene.id,
                Asset.asset_type == AssetType.scene_video,
                Asset.take_index == candidate,
            )
            .order_by(Asset.created_at.desc())
            .limit(1)
        )
        asset = result.scalar_one_or_none()
        if asset is not None:
            return asset
    return None


async def get_stitch_readiness(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID
) -> tuple[int, list[int]]:
    """
    (scenes with a clip, scene numbers still missing one).

    Asked before offering the button rather than after pressing it: a
    creator who is one scene short should be told which scene, not handed a
    refusal once they have committed.
    """
    await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(
        select(Storyboard)
        .where(Storyboard.project_id == project_id)
        .options(selectinload(Storyboard.scenes))
    )
    storyboard = result.scalar_one_or_none()
    if storyboard is None or not storyboard.scenes:
        return 0, []

    ready = 0
    missing: list[int] = []
    for scene in sorted(storyboard.scenes, key=lambda s: s.order):
        if await _existing_clip(db, scene) is not None:
            ready += 1
        else:
            missing.append(scene.order)
    return ready, missing


async def start_stitch(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID
) -> tuple[GenerationJob, bool]:
    """
    Makes the finished video out of the clips already generated.

    Calls the video provider zero times, so it costs nothing. This is the
    gap it closes: generating scenes one at a time left a project full of
    paid clips and no way to combine them, because the only route to a
    finished video was a full run that regenerated and re-billed every one
    of them.
    """
    project = await project_service.get_owned_project(db, creator_id, project_id)

    ready, missing = await get_stitch_readiness(db, creator_id, project_id)
    if not ready:
        raise ValidationAppError(
            "None of the scenes have been generated yet, so there is nothing to "
            "combine. Generate the video first."
        )
    if missing:
        listed = ", ".join(str(order) for order in missing)
        raise ValidationAppError(
            f"Scene {listed} hasn't been generated yet, so the video would have a "
            "gap in it. Generate the missing scenes, then combine."
            if len(missing) == 1
            else f"Scenes {listed} haven't been generated yet, so the video would "
            "have gaps in it. Generate the missing scenes, then combine."
        )

    existing = await _get_latest_job(db, project.id)
    if existing is not None and existing.status in (JobStatus.queued, JobStatus.processing):
        return existing, False

    job = GenerationJob(
        project_id=project.id,
        creator_id=creator_id,
        stitch_only=True,
        status=JobStatus.queued,
    )
    db.add(job)
    project.status = ProjectStatus.generating
    await db.commit()
    await db.refresh(job)
    return job, True


async def get_generation_status(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID
) -> GenerationJob:
    await project_service.get_owned_project(db, creator_id, project_id)
    job = await _get_latest_job(db, project_id)
    if job is None:
        raise NotFoundError("No generation job has been started for this project yet.")
    return job


async def get_video_output(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> VideoOutput:
    await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(select(VideoOutput).where(VideoOutput.project_id == project_id))
    output = result.scalar_one_or_none()
    if output is None:
        raise NotFoundError("No finished video is available for this project yet.")
    return output


async def get_scene_asset(
    db: AsyncSession,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    take: int | None = None,
) -> Asset:
    """
    The newest generated clip for one scene. Newest rather than only, since
    regenerating a scene writes a fresh asset each time.

    `take` picks one of several takes from the same run. Omitted, it returns
    whichever take the scene is currently set to use, so a caller that knows
    nothing about takes still gets the clip the final video will contain.
    """
    await project_service.get_owned_project(db, creator_id, project_id)

    if take is None:
        scene = await db.get(StoryboardScene, scene_id)
        take = scene.selected_take if scene else 0

    query = select(Asset).where(
        Asset.project_id == project_id,
        Asset.scene_id == scene_id,
        Asset.creator_id == creator_id,
        Asset.asset_type == AssetType.scene_video,
        Asset.take_index == take,
    )
    result = await db.execute(query.order_by(Asset.created_at.desc()).limit(1))
    asset = result.scalar_one_or_none()

    # Clips generated before takes existed carry take_index 0 by migration
    # default, so this only fires when a caller asks for a take that run
    # never produced.
    if asset is None and take != 0:
        result = await db.execute(
            query.where(Asset.take_index == 0).order_by(Asset.created_at.desc()).limit(1)
        )
        asset = result.scalar_one_or_none()

    if asset is None:
        raise NotFoundError("This scene hasn't been generated yet.")
    return asset


async def get_scene(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID, scene_id: uuid.UUID
) -> StoryboardScene:
    await project_service.get_owned_project(db, creator_id, project_id)
    scene = await db.get(StoryboardScene, scene_id)
    if scene is None or scene.creator_id != creator_id:
        raise NotFoundError("No such scene in this storyboard.")
    return scene


async def count_scene_takes(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID, scene_id: uuid.UUID
) -> int:
    """How many takes of this scene are on hand to choose between."""
    await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(
        select(func.count(func.distinct(Asset.take_index))).where(
            Asset.project_id == project_id,
            Asset.scene_id == scene_id,
            Asset.creator_id == creator_id,
            Asset.asset_type == AssetType.scene_video,
        )
    )
    return int(result.scalar_one() or 0)


async def select_scene_take(
    db: AsyncSession,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    take: int,
) -> StoryboardScene:
    """
    Picks which take the final video uses for one scene.

    Changes nothing that has already been rendered: the finished video is
    only rebuilt when the creator asks for it, so choosing a take here costs
    nothing and is freely reversible.
    """
    await project_service.get_owned_project(db, creator_id, project_id)
    scene = await db.get(StoryboardScene, scene_id)
    if scene is None or scene.creator_id != creator_id:
        raise NotFoundError("No such scene in this storyboard.")

    available = await count_scene_takes(db, creator_id, project_id, scene_id)
    if take < 0 or take >= max(available, 1):
        raise ValidationAppError("That take hasn't been generated for this scene.")

    scene.selected_take = take
    await db.commit()
    await db.refresh(scene)
    return scene


async def _wait_for_completion(
    video_provider: VideoProvider,
    provider_job_id: str,
    *,
    poll_interval_seconds: float = 2.0,
    max_attempts: int = 150,
) -> None:
    for _ in range(max_attempts):
        status = await video_provider.get_job_status(provider_job_id)
        if status.status == "completed":
            return
        if status.status == "failed":
            raise GenerationError(status.error_message or "Video generation failed.")
        await asyncio.sleep(poll_interval_seconds)
    raise GenerationError("Video generation timed out.")


async def _finish_video(
    db: AsyncSession,
    settings: Settings,
    storage,
    job: GenerationJob,
    project: Project,
    render_inputs: list[Path],
    output,
    temp_files: list[Path],
) -> None:
    """
    Stitches the clips into the finished video and marks the run done.

    Shared by both paths deliberately. A stitch-only run and a full run must
    produce byte-identical output from the same clips - if they could differ,
    "combine what I have" would quietly be a second, lesser kind of render.
    """
    job.current_stage = "Rendering final video"
    await db.commit()

    final_path, duration = await render_final_video(
        settings, render_inputs, size=output_size(settings, output)
    )
    temp_files.append(final_path)

    if not final_path.exists() or final_path.stat().st_size == 0 or duration <= 0:
        raise GenerationError("Rendered output failed validation.")

    final_bytes = final_path.read_bytes()
    output_storage_key = f"{project.creator_id}/{project.id}/output.mp4"
    await asyncio.to_thread(storage.save, output_storage_key, final_bytes)

    existing_output = await db.execute(
        select(VideoOutput).where(VideoOutput.project_id == project.id)
    )
    video_output = existing_output.scalar_one_or_none()
    if video_output is None:
        video_output = VideoOutput(project_id=project.id, creator_id=project.creator_id)
        db.add(video_output)

    video_output.storage_key = output_storage_key
    video_output.mime_type = "video/mp4"
    video_output.duration_seconds = duration
    video_output.file_size_bytes = len(final_bytes)

    project.status = ProjectStatus.completed
    job.status = JobStatus.completed
    job.current_stage = "Completed"
    job.error_message = None
    await db.commit()


async def run_generation_job(job_id: uuid.UUID) -> None:
    """
    The actual worker. Runs in its own DB session since it executes after
    the originating request has finished (via BackgroundTasks today; a
    Celery task equivalent lands once Redis is provisioned, same pattern
    as knowledge ingestion).
    """
    settings = get_settings()
    session_factory = get_session_factory()

    async with session_factory() as db:
        job = await db.get(GenerationJob, job_id)
        if job is None:
            return
        project = await db.get(Project, job.project_id)
        if project is None:
            return

        temp_files: list[Path] = []
        try:
            job.status = JobStatus.processing
            job.current_stage = "Generating scenes"
            await db.commit()

            result = await db.execute(
                select(Storyboard)
                .where(Storyboard.project_id == project.id)
                .options(selectinload(Storyboard.scenes))
            )
            storyboard = result.scalar_one()
            scenes = sorted(storyboard.scenes, key=lambda s: s.order)
            # A single-scene job renders that scene alone and stops there.
            single_scene = job.scene_id is not None
            if single_scene:
                scenes = [s for s in scenes if s.id == job.scene_id]
                if not scenes:
                    raise GenerationError("That scene is no longer in the storyboard.")

            # Set before the first (billable) request goes out, so the UI can
            # show real progress from the moment the run starts rather than an
            # unbounded spinner.
            job.scenes_total = len(scenes)
            job.scenes_completed = 0
            await db.commit()

            storage = get_storage_provider(settings)
            output = project_output_settings(project)
            render_inputs: list[Path] = []

            if job.stitch_only:
                # Never touches the video provider, which is the whole point:
                # this run is free. Building a provider here would also load
                # service account credentials for a job that cannot make a
                # request, and would fail a project whose credentials have
                # since gone stale for no reason at all.
                for index, scene in enumerate(scenes, start=1):
                    job.current_stage = f"Collecting clip {index} of {len(scenes)}"
                    await db.commit()

                    asset = await _existing_clip(db, scene)
                    if asset is None:
                        raise GenerationError(
                            f"Scene {scene.order} has no generated clip any more, so "
                            "the video cannot be combined. Generate that scene, then "
                            "try again."
                        )
                    clip_bytes = await asyncio.to_thread(storage.read, asset.storage_key)
                    local_path = (
                        Path(tempfile.gettempdir()) / f"oneinfo-stitch-{uuid.uuid4()}.mp4"
                    )
                    local_path.write_bytes(clip_bytes)
                    temp_files.append(local_path)
                    render_inputs.append(local_path)
                    job.scenes_completed = index
                    await db.commit()

                await _finish_video(
                    db, settings, storage, job, project, render_inputs, output, temp_files
                )
                return

            video_provider = get_video_provider(settings)

            # Fetched once, not per scene: the same photos go to every
            # on-camera scene, and re-reading them from storage each time
            # would just be extra I/O.
            face_images: list[bytes] = []
            if any(scene.features_creator for scene in scenes):
                face_images = await creator_face_service.load_face_bytes(
                    db, settings, project.creator_id
                )

            for index, scene in enumerate(scenes, start=1):
                job.current_stage = (
                    "Generating your scene"
                    if single_scene
                    else f"Generating scene {index} of {len(scenes)}"
                )
                await db.commit()

                provider_job_id = await video_provider.create_video_job(
                    VideoGenerationRequest(
                        visual_prompt=scene.visual_prompt,
                        duration_seconds=scene.duration_seconds,
                        # Only on-camera scenes carry the face, so only they
                        # get routed to the pricier reference model.
                        reference_images=face_images if scene.features_creator else [],
                        aspect_ratio=output.aspect_ratio.value,
                        resolution=output.resolution.value,
                        sample_count=output.takes,
                        prefer_reference_model=output.model_tier is ModelTier.fast,
                    )
                )
                await _wait_for_completion(video_provider, provider_job_id)
                takes = await video_provider.download_all_results(provider_job_id)

                # Every take is saved, because every take was billed. The
                # creator picks between them afterwards; throwing the rest
                # away here would charge four times for one clip.
                take_paths: list[Path] = []
                for take_index, video_bytes in enumerate(takes):
                    local_path = (
                        Path(tempfile.gettempdir()) / f"oneinfo-scene-{uuid.uuid4()}.mp4"
                    )
                    local_path.write_bytes(video_bytes)
                    temp_files.append(local_path)
                    take_paths.append(local_path)

                    take_duration = await probe_duration_seconds(
                        settings.ffprobe_path, str(local_path)
                    )
                    storage_key = (
                        f"{project.creator_id}/{project.id}/scenes/"
                        f"{scene.id}-take{take_index}.mp4"
                    )
                    await asyncio.to_thread(storage.save, storage_key, video_bytes)
                    db.add(
                        Asset(
                            creator_id=project.creator_id,
                            project_id=project.id,
                            scene_id=scene.id,
                            asset_type=AssetType.scene_video,
                            storage_key=storage_key,
                            mime_type="video/mp4",
                            duration_seconds=take_duration,
                            take_index=take_index,
                        )
                    )

                # A fresh run invalidates whichever take was picked last time:
                # that clip no longer exists, so the choice cannot carry over.
                if scene.selected_take >= len(take_paths):
                    scene.selected_take = 0
                render_inputs.append(take_paths[scene.selected_take])
                job.scenes_completed = index
                await db.commit()

            if single_scene:
                # Nothing to stitch, and no finished video to publish - the
                # scene asset saved above is the whole deliverable. Writing a
                # VideoOutput here would overwrite the real finished video
                # with a fragment of it.
                job.status = JobStatus.completed
                job.current_stage = "Completed"
                job.error_message = None
                await db.commit()
                return

            await _finish_video(
                db, settings, storage, job, project, render_inputs, output, temp_files
            )
        except Exception as exc:
            await db.rollback()
            job = await db.get(GenerationJob, job_id)
            project = await db.get(Project, job.project_id) if job else None
            if job is not None:
                job.status = JobStatus.failed
                message, detail = _describe_failure(exc, job.current_stage)
                job.error_message = message[:500]
                job.error_detail = detail[:2000]
            # A failed one-scene preview says nothing about the project as a
            # whole - the storyboard is still fine and the creator can just
            # try a different scene. Only a real generation run fails it.
            if project is not None and (job is None or job.scene_id is None):
                project.status = ProjectStatus.failed
            await db.commit()
        finally:
            for path in temp_files:
                path.unlink(missing_ok=True)
