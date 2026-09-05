import asyncio
import tempfile
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings, get_settings
from app.core.errors import AppError, NotFoundError, ValidationAppError
from app.db.base import get_session_factory
from app.models.asset import Asset, AssetType
from app.models.creator import Creator
from app.models.generation_job import GenerationJob, JobStatus
from app.models.project import Project, ProjectStatus
from app.models.storyboard import Storyboard
from app.models.video_output import VideoOutput
from app.providers.ffmpeg_runner import probe_duration_seconds
from app.providers.storage import get_storage_provider
from app.providers.video import get_supported_durations, get_video_provider
from app.providers.video.base import VideoGenerationRequest, VideoProvider
from app.services import creator_face_service, project_service
from app.services.rendering_service import render_final_video


class GenerationError(AppError):
    code = "GENERATION_FAILED"
    status_code = 500


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
    for scene in target_scenes:
        # On-camera scenes are bound by the tighter reference-to-video limit.
        allowed = get_supported_durations(settings, with_reference=scene.features_creator)
        if allowed and scene.duration_seconds not in allowed:
            options = ", ".join(str(d) for d in sorted(allowed))
            kind = "scenes you appear in" if scene.features_creator else "b-roll scenes"
            raise ValidationAppError(
                f"Scene {scene.order} is {scene.duration_seconds}s, which the video "
                f"provider cannot render: {options} second(s) only, for {kind}. "
                "Regenerate the storyboard to fix it."
            )

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
    db: AsyncSession, creator_id: str, project_id: uuid.UUID, scene_id: uuid.UUID
) -> Asset:
    """
    The newest generated clip for one scene. Newest rather than only, since
    regenerating a scene writes a fresh asset each time.
    """
    await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(
        select(Asset)
        .where(
            Asset.project_id == project_id,
            Asset.scene_id == scene_id,
            Asset.creator_id == creator_id,
            Asset.asset_type == AssetType.scene_video,
        )
        .order_by(Asset.created_at.desc())
        .limit(1)
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise NotFoundError("This scene hasn't been generated yet.")
    return asset


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

            video_provider = get_video_provider(settings)
            storage = get_storage_provider(settings)

            # Fetched once, not per scene: the same photos go to every
            # on-camera scene, and re-reading them from storage each time
            # would just be extra I/O.
            face_images: list[bytes] = []
            if any(scene.features_creator for scene in scenes):
                face_images = await creator_face_service.load_face_bytes(
                    db, settings, project.creator_id
                )

            render_inputs: list[tuple[Path, str]] = []
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
                    )
                )
                await _wait_for_completion(video_provider, provider_job_id)
                video_bytes = await video_provider.download_result(provider_job_id)

                local_path = Path(tempfile.gettempdir()) / f"oneinfo-scene-{uuid.uuid4()}.mp4"
                local_path.write_bytes(video_bytes)
                temp_files.append(local_path)

                scene_duration = await probe_duration_seconds(settings.ffprobe_path, str(local_path))

                storage_key = f"{project.creator_id}/{project.id}/scenes/{scene.id}.mp4"
                await asyncio.to_thread(storage.save, storage_key, video_bytes)
                db.add(
                    Asset(
                        creator_id=project.creator_id,
                        project_id=project.id,
                        scene_id=scene.id,
                        asset_type=AssetType.scene_video,
                        storage_key=storage_key,
                        mime_type="video/mp4",
                        duration_seconds=scene_duration,
                    )
                )
                render_inputs.append((local_path, scene.caption))

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

            job.current_stage = "Rendering final video"
            await db.commit()

            final_path, duration = await render_final_video(settings, render_inputs)
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
        except Exception as exc:
            await db.rollback()
            job = await db.get(GenerationJob, job_id)
            project = await db.get(Project, job.project_id) if job else None
            if job is not None:
                job.status = JobStatus.failed
                # Some exceptions stringify to nothing at all, which leaves the
                # creator staring at a failed job with no reason given. Fall
                # back to the type name so there is always something to act on.
                job.error_message = (str(exc) or type(exc).__name__)[:500]
            # A failed one-scene preview says nothing about the project as a
            # whole - the storyboard is still fine and the creator can just
            # try a different scene. Only a real generation run fails it.
            if project is not None and (job is None or job.scene_id is None):
                project.status = ProjectStatus.failed
            await db.commit()
        finally:
            for path in temp_files:
                path.unlink(missing_ok=True)
