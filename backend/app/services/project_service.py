import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.project import Project, ProjectStatus
from app.services import environment_setup_service


async def create_project(
    db: AsyncSession,
    creator_id: str,
    idea: str,
    title: str | None,
    language: str | None = None,
) -> Project:
    # A truncated idea is a placeholder, not a title. It stands in until the
    # research agent runs during hook generation and can name the thing
    # properly — see hook_service.
    chosen_title = (title or "").strip()
    if language is None:
        language = await _last_used_language(db, creator_id)

    # The whole point of saving a setup: a creator who marked one as their
    # usual gets it on the next project without opening the panel. Nothing
    # marked means the built-in default, exactly as before.
    default_setup = await environment_setup_service.get_default_setup(db, creator_id)

    project = Project(
        creator_id=creator_id,
        title=chosen_title or idea.strip()[:80],
        idea=idea,
        language=language,
        default_environment=default_setup.environment if default_setup else None,
        title_is_auto=not chosen_title,
        status=ProjectStatus.draft,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


async def _last_used_language(db: AsyncSession, creator_id: str) -> str:
    """
    The language of this creator's most recent project.

    Nothing asks for a language when a project is created any more — the
    picker lives in the workflow header — so a hardcoded "english" here
    quietly reset a Tenglish creator on every new project and made them
    change it again by hand. Their last project is the better guess; the
    fallback only applies to someone's very first one.
    """
    result = await db.execute(
        select(Project.language)
        .where(Project.creator_id == creator_id)
        .order_by(Project.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none() or "english"


async def list_projects(db: AsyncSession, creator_id: str) -> list[Project]:
    result = await db.execute(
        select(Project).where(Project.creator_id == creator_id).order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())


async def get_owned_project(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.creator_id == creator_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise NotFoundError("Project not found.")
    return project


async def update_language(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID, language: str
) -> Project:
    """
    Changes the language later steps generate in.

    Deliberately leaves existing hooks and scripts alone. They were written
    in the old language and translating them here would silently rewrite
    work the creator may have already approved — the new language applies
    from the next generation onward.
    """
    project = await get_owned_project(db, creator_id, project_id)
    project.language = language
    await db.commit()
    await db.refresh(project)
    return project
