import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.project import Project, ProjectStatus


async def create_project(db: AsyncSession, creator_id: str, idea: str, title: str | None) -> Project:
    project = Project(
        creator_id=creator_id,
        title=title or idea[:80],
        idea=idea,
        status=ProjectStatus.draft,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


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
