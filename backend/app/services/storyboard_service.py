import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.qa_agent import run_qa_agent
from app.agents.storyboard_agent import run_storyboard_agent
from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.models.creator import Creator
from app.models.project import ProjectStatus
from app.models.script import ContentStatus
from app.models.storyboard import Storyboard, StoryboardScene
from app.providers.llm import get_llm_provider
from app.providers.video import get_supported_durations
from app.providers.video.base import snap_duration
from app.schemas.agents import StoryboardOutput
from app.services import (
    creator_face_service,
    project_service,
    script_service,
    tanglish_service,
)

# Matches the ceiling the storyboard prompt asks the model to respect.
MAX_ON_CAMERA_SCENES = 2


def _normalize_scenes(
    output: StoryboardOutput, allowed_durations: tuple[int, ...] | None
) -> None:
    """
    Make the model's storyboard renderable before anything acts on it.

    Two things the LLM gets wrong often enough to matter: it repeats or
    skips scene numbers, and it invents durations the video provider can't
    render. Veo rejects any clip that isn't 4, 6 or 8 seconds - and because
    scenes are generated one at a time, discovering that at scene 2 means
    scene 1 has already been generated and billed. Fixing both here keeps
    the stored storyboard consistent with what generation can actually do.
    """
    scenes = sorted(output.scenes, key=lambda scene: scene.order)
    for index, scene in enumerate(scenes, start=1):
        scene.order = index
        scene.duration_seconds = snap_duration(scene.duration_seconds, allowed_durations)
    output.scenes = scenes


def _cap_on_camera_scenes(output: StoryboardOutput, allowed: bool) -> None:
    """
    On-camera scenes cost several times a b-roll scene, so the model is asked
    for at most two and held to it here. Left unchecked, an LLM that decides
    every scene should feature the creator turns a Rs.482 video into Rs.1,719
    with no one having chosen that.
    """
    if not allowed:
        for scene in output.scenes:
            scene.features_creator = False
        return
    seen = 0
    for scene in output.scenes:
        if scene.features_creator:
            seen += 1
            if seen > MAX_ON_CAMERA_SCENES:
                scene.features_creator = False


async def generate_storyboard(
    db: AsyncSession, settings: Settings, creator_id: str, project_id: uuid.UUID
) -> Storyboard:
    project = await project_service.get_owned_project(db, creator_id, project_id)

    english_script = await script_service.get_current_script(db, creator_id, project_id)
    if english_script.status != ContentStatus.approved:
        raise ValidationAppError("Approve the script before generating a storyboard.")

    # Tanglish is optional — use it only if the creator approved one.
    source_content = english_script.content
    tanglish = await tanglish_service.get_latest_tanglish(db, project_id)
    if tanglish is not None and tanglish.status == ContentStatus.approved:
        source_content = tanglish.content

    # The creator can only be written into the storyboard if they could
    # actually be generated: a reference photo on file and consent given.
    creator = await db.get(Creator, creator_id)
    on_camera_available = (
        creator is not None
        and creator.face_consent_at is not None
        and bool(await creator_face_service.list_faces(db, creator_id))
    )

    llm = get_llm_provider(settings)
    allowed_durations = get_supported_durations(settings)
    output = await run_storyboard_agent(
        llm,
        script_content=source_content,
        estimated_duration_seconds=english_script.estimated_duration_seconds,
        allowed_durations=allowed_durations,
        creator_on_camera=on_camera_available,
        appearance_description=creator.appearance_description if creator else None,
        voice_description=creator.voice_description if creator else None,
    )
    _normalize_scenes(output, allowed_durations)
    _cap_on_camera_scenes(output, on_camera_available)
    qa_result = run_qa_agent(
        output, estimated_duration_seconds=english_script.estimated_duration_seconds
    )

    result = await db.execute(select(Storyboard).where(Storyboard.project_id == project.id))
    storyboard = result.scalar_one_or_none()
    if storyboard is None:
        storyboard = Storyboard(project_id=project.id, creator_id=creator_id)
        db.add(storyboard)
        await db.flush()
    else:
        await db.execute(delete(StoryboardScene).where(StoryboardScene.storyboard_id == storyboard.id))

    storyboard.qa_passed = qa_result.passed
    storyboard.qa_issues = qa_result.issues

    for scene in output.scenes:
        db.add(
            StoryboardScene(
                storyboard_id=storyboard.id,
                creator_id=creator_id,
                order=scene.order,
                duration_seconds=scene.duration_seconds,
                voiceover=scene.voiceover,
                visual_prompt=scene.visual_prompt,
                caption=scene.caption,
                features_creator=scene.features_creator,
            )
        )

    project.status = ProjectStatus.storyboard
    await db.commit()

    return await get_storyboard(db, creator_id, project_id)


async def get_storyboard(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> Storyboard:
    await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(
        select(Storyboard)
        .where(Storyboard.project_id == project_id, Storyboard.creator_id == creator_id)
        .options(selectinload(Storyboard.scenes))
    )
    storyboard = result.scalar_one_or_none()
    if storyboard is None:
        raise NotFoundError("No storyboard has been generated for this project yet.")
    return storyboard


async def set_scene_on_camera(
    db: AsyncSession,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    features_creator: bool,
) -> Storyboard:
    """
    Let the creator override the agent's call on which scenes they appear in.

    Turning a scene on is gated the same way generation is - a photo and
    consent - so the refusal arrives while editing rather than at the point
    of spending. Turning one off is always allowed: nobody should have to
    satisfy a precondition to take themselves out of a video.
    """
    await project_service.get_owned_project(db, creator_id, project_id)
    storyboard = await get_storyboard(db, creator_id, project_id)

    scene = next((s for s in storyboard.scenes if s.id == scene_id), None)
    if scene is None:
        raise NotFoundError("No such scene in this storyboard.")

    if features_creator and not scene.features_creator:
        creator = await db.get(Creator, creator_id)
        if creator is None:
            raise NotFoundError("Creator not found.")
        creator_face_service.require_consent(creator)
        if not await creator_face_service.list_faces(db, creator_id):
            raise ValidationAppError(
                "Upload a reference photo in Settings before putting yourself on camera."
            )
        on_camera = sum(1 for s in storyboard.scenes if s.features_creator)
        if on_camera >= MAX_ON_CAMERA_SCENES:
            raise ValidationAppError(
                f"At most {MAX_ON_CAMERA_SCENES} scenes can feature you on camera - "
                "they cost several times a b-roll scene. Turn another one off first."
            )

    scene.features_creator = features_creator
    await db.commit()
    return await get_storyboard(db, creator_id, project_id)
