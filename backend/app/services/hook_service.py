import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.hook_agent import run_hook_agent
from app.core.config import Settings
from app.core.errors import NotFoundError
from app.models.hook import Hook
from app.models.project import ProjectStatus
from app.providers.llm import get_llm_provider
from app.schemas.agents import ResearchContext
from app.services import link_context, project_service
from app.services.rag_service import retrieve


async def generate_hooks(
    db: AsyncSession, settings: Settings, creator_id: str, project_id: uuid.UUID
) -> list[Hook]:
    project = await project_service.get_owned_project(db, creator_id, project_id)

    # An idea that is mostly a link has no subject in it. Left alone, the
    # agent takes its subject from retrieved knowledge instead - which is how
    # a project whose idea was an Odoo event page came back with hooks about
    # a Sarvam hackathon, the nearest thing in this creator's filed material.
    # So the page is read first, and if it cannot be read nothing is
    # generated: a confident video about the wrong event is far worse than a
    # step that stops and says why.
    source = await link_context.for_idea(db, settings, creator_id, project)

    chunks = await retrieve(db, settings, creator_id, project.idea, k=settings.rag_top_k)
    knowledge_texts = [chunk.content for chunk in chunks]
    llm = get_llm_provider(settings)

    # Cached from a previous run; None means the agent works it out as part
    # of the same call that writes the hooks, rather than a second round trip
    # the creator waits through before anything appears.
    cached_research = (
        ResearchContext(
            topic=project.research_topic,
            audience=project.research_audience or "",
            goal=project.research_goal or "",
            angle=project.research_angle or "",
        )
        if project.research_topic
        else None
    )

    hook_list = await run_hook_agent(
        llm,
        idea=project.idea,
        source=source,
        research=cached_research,
        knowledge_chunks=knowledge_texts,
        count=settings.hook_candidate_count,
        language=project.language,
    )

    if cached_research is None:
        research = hook_list.research
        project.research_topic = research.topic
        project.research_audience = research.audience
        project.research_goal = research.goal
        project.research_angle = research.angle

        # The agent has just named the topic, which beats the truncated idea
        # standing in as a title. Only replaces a title nobody typed.
        if project.title_is_auto and research.topic.strip():
            project.title = research.topic.strip()[:80]
            project.title_is_auto = False

    # Regenerating replaces the agent's suggestions but keeps hooks the
    # creator wrote themselves — those took effort and were never the thing
    # they wanted rerolled.
    await db.execute(delete(Hook).where(Hook.project_id == project.id, Hook.is_custom.is_(False)))
    project.selected_hook_id = None
    await db.execute(update(Hook).where(Hook.project_id == project.id).values(is_selected=False))

    new_hooks = [
        Hook(
            project_id=project.id,
            creator_id=creator_id,
            text=h.text,
            type=h.type,
            reason=h.reason,
            is_recommended=(index == hook_list.recommended_index),
        )
        for index, h in enumerate(hook_list.hooks)
    ]
    db.add_all(new_hooks)

    if project.status == ProjectStatus.draft:
        project.status = ProjectStatus.hooks

    await db.commit()
    for hook in new_hooks:
        await db.refresh(hook)
    # Same order the list endpoint uses, so a caller that renders this
    # response directly does not show a different order to one that refetches.
    return sorted(new_hooks, key=lambda h: (not h.is_recommended, h.created_at))


async def list_hooks(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> list[Hook]:
    await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(
        select(Hook)
        .where(Hook.project_id == project_id, Hook.creator_id == creator_id)
        # The agent's pick leads. It argued for one option, so burying it
        # third in creation order makes the reader hunt for the answer they
        # were given — and the position numbers then agree with it.
        .order_by(Hook.is_recommended.desc(), Hook.created_at)
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


async def add_custom_hook(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID, text: str
) -> Hook:
    """
    Files a hook the creator wrote themselves alongside the generated ones.

    They often arrive with a hook already written — from a previous chat, or
    just from knowing their audience — and had no way to carry it into the
    pipeline short of regenerating until something close came up.
    """
    project = await project_service.get_owned_project(db, creator_id, project_id)

    hook = Hook(
        project_id=project.id,
        creator_id=creator_id,
        text=text.strip(),
        type="your own",
        is_custom=True,
    )
    db.add(hook)

    if project.status == ProjectStatus.draft:
        project.status = ProjectStatus.hooks

    await db.commit()
    await db.refresh(hook)
    return hook
