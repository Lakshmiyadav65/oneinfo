import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.qa_agent import run_qa_agent
from app.agents.storyboard_agent import run_storyboard_agent
from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.models.project import ProjectStatus
from app.models.script import ContentStatus
from app.models.storyboard import Storyboard, StoryboardScene
from app.providers.llm import get_llm_provider
from app.services import project_service, script_service, tanglish_service


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

    llm = get_llm_provider(settings)
    output = await run_storyboard_agent(
        llm,
        script_content=source_content,
        estimated_duration_seconds=english_script.estimated_duration_seconds,
    )
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
