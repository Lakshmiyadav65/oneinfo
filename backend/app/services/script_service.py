import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.script_agent import run_script_agent
from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.models.hook import Hook
from app.models.project import Project, ProjectStatus
from app.models.script import ContentStatus, Script
from app.providers.llm import get_llm_provider
from app.services import project_service
from app.services.rag_service import retrieve


async def _get_selected_hook(db: AsyncSession, project: Project) -> Hook:
    if project.selected_hook_id is None:
        raise ValidationAppError("Select a hook before generating a script.")
    result = await db.execute(select(Hook).where(Hook.id == project.selected_hook_id))
    hook = result.scalar_one_or_none()
    if hook is None:
        raise ValidationAppError("Selected hook could not be found.")
    return hook


async def get_latest_script(db: AsyncSession, project_id: uuid.UUID) -> Script | None:
    result = await db.execute(
        select(Script).where(Script.project_id == project_id).order_by(Script.version.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def generate_script(
    db: AsyncSession, settings: Settings, creator_id: str, project_id: uuid.UUID
) -> Script:
    """Also serves /script/regenerate — same agent call, same version rule."""
    project = await project_service.get_owned_project(db, creator_id, project_id)
    hook = await _get_selected_hook(db, project)

    chunks = await retrieve(db, settings, creator_id, project.idea, k=settings.rag_top_k)
    knowledge_texts = [c.content for c in chunks]

    llm = get_llm_provider(settings)
    output = await run_script_agent(
        llm, idea=project.idea, selected_hook_text=hook.text, knowledge_chunks=knowledge_texts
    )

    existing = await get_latest_script(db, project.id)
    if existing is None:
        script = Script(
            project_id=project.id,
            creator_id=creator_id,
            version=1,
            title=output.title,
            language=output.language,
            content=output.script,
            estimated_duration_seconds=output.estimated_duration_seconds,
            status=ContentStatus.draft,
        )
        db.add(script)
    elif existing.status == ContentStatus.draft:
        # Nothing approved yet to protect — overwrite in place.
        existing.title = output.title
        existing.language = output.language
        existing.content = output.script
        existing.estimated_duration_seconds = output.estimated_duration_seconds
        script = existing
    else:
        # Never silently overwrite an approved version — start a new one.
        script = Script(
            project_id=project.id,
            creator_id=creator_id,
            version=existing.version + 1,
            title=output.title,
            language=output.language,
            content=output.script,
            estimated_duration_seconds=output.estimated_duration_seconds,
            status=ContentStatus.draft,
        )
        db.add(script)

    if project.status in (ProjectStatus.draft, ProjectStatus.hooks):
        project.status = ProjectStatus.script

    await db.commit()
    await db.refresh(script)
    return script


async def get_current_script(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> Script:
    await project_service.get_owned_project(db, creator_id, project_id)
    script = await get_latest_script(db, project_id)
    if script is None:
        raise NotFoundError("No script has been generated for this project yet.")
    return script


async def update_script(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID, content: str, title: str | None
) -> Script:
    project = await project_service.get_owned_project(db, creator_id, project_id)
    script = await get_latest_script(db, project.id)
    if script is None:
        raise NotFoundError("No script has been generated for this project yet.")
    if script.status == ContentStatus.approved:
        raise ValidationAppError("This script is already approved. Regenerate to create a new version.")

    script.content = content
    if title:
        script.title = title
    await db.commit()
    await db.refresh(script)
    return script


async def approve_script(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> Script:
    project = await project_service.get_owned_project(db, creator_id, project_id)
    script = await get_latest_script(db, project.id)
    if script is None:
        raise NotFoundError("No script has been generated for this project yet.")
    script.status = ContentStatus.approved
    await db.commit()
    await db.refresh(script)
    return script
