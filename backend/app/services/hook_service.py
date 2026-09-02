import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.hook_agent import run_hook_agent
from app.agents.research_agent import run_research_agent
from app.core.config import Settings
from app.core.errors import NotFoundError
from app.models.hook import Hook
from app.models.project import ProjectStatus
from app.providers.llm import get_llm_provider
from app.schemas.agents import ResearchContext
from app.services import project_service
from app.services.rag_service import retrieve


async def generate_hooks(
    db: AsyncSession, settings: Settings, creator_id: str, project_id: uuid.UUID
) -> list[Hook]:
    project = await project_service.get_owned_project(db, creator_id, project_id)

    chunks = await retrieve(db, settings, creator_id, project.idea, k=settings.rag_top_k)
    knowledge_texts = [chunk.content for chunk in chunks]
    llm = get_llm_provider(settings)

    if project.research_topic:
        research = ResearchContext(
            topic=project.research_topic,
            audience=project.research_audience or "",
            goal=project.research_goal or "",
            angle=project.research_angle or "",
        )
    else:
        research = await run_research_agent(llm, idea=project.idea, knowledge_chunks=knowledge_texts)
        project.research_topic = research.topic
        project.research_audience = research.audience
        project.research_goal = research.goal
        project.research_angle = research.angle

    hook_list = await run_hook_agent(
        llm,
        idea=project.idea,
        research=research,
        knowledge_chunks=knowledge_texts,
        count=settings.hook_candidate_count,
    )

    # Regenerating starts hook selection over from scratch.
    await db.execute(delete(Hook).where(Hook.project_id == project.id))
    project.selected_hook_id = None

    new_hooks = [
        Hook(project_id=project.id, creator_id=creator_id, text=h.text, type=h.type)
        for h in hook_list.hooks
    ]
    db.add_all(new_hooks)

    if project.status == ProjectStatus.draft:
        project.status = ProjectStatus.hooks

    await db.commit()
    for hook in new_hooks:
        await db.refresh(hook)
    return new_hooks


async def list_hooks(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> list[Hook]:
    await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(
        select(Hook)
        .where(Hook.project_id == project_id, Hook.creator_id == creator_id)
        .order_by(Hook.created_at)
    )
    return list(result.scalars().all())


async def select_hook(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID, hook_id: uuid.UUID
) -> Hook:
    project = await project_service.get_owned_project(db, creator_id, project_id)

    result = await db.execute(
        select(Hook).where(
            Hook.id == hook_id, Hook.project_id == project.id, Hook.creator_id == creator_id
        )
    )
    hook = result.scalar_one_or_none()
    if hook is None:
        raise NotFoundError("Hook not found.")

    await db.execute(
        update(Hook)
        .where(Hook.project_id == project.id, Hook.id != hook.id)
        .values(is_selected=False)
    )
    hook.is_selected = True
    project.selected_hook_id = hook.id
    await db.commit()
    await db.refresh(hook)
    return hook
