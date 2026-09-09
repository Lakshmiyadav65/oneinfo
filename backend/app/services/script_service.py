import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.script_agent import carry_hook_over, render_script, run_script_agent
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


async def _write_script(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    project_id: uuid.UUID,
    *,
    previous: Script | None,
) -> Script:
    """
    One agent call, written down as a new version.

    `previous` is the version being rewritten, if any: its hook is carried
    into the new take, and its number decides the next one.
    """
    project = await project_service.get_owned_project(db, creator_id, project_id)
    hook = await _get_selected_hook(db, project)

    chunks = await retrieve(db, settings, creator_id, project.idea, k=settings.rag_top_k)
    knowledge_texts = [c.content for c in chunks]

    llm = get_llm_provider(settings)
    output = await run_script_agent(
        llm,
        idea=project.idea,
        selected_hook_text=hook.text,
        knowledge_chunks=knowledge_texts,
        # The project's language, not the agent's guess. The prompt used to
        # say "in English" outright, and only landed in the creator's
        # language when the selected hook happened to drag it there.
        language=project.language,
    )
    beats = output.beats
    if previous is not None:
        beats = carry_hook_over(beats, previous.content)

    script = Script(
        project_id=project.id,
        creator_id=creator_id,
        # Every rewrite is a new version, including one over a draft. It used
        # to overwrite a draft in place, which meant a creator who preferred
        # the previous take had no way back to it.
        version=1 if previous is None else previous.version + 1,
        title=output.title,
        language=output.language,
        content=render_script(beats),
        estimated_duration_seconds=output.estimated_duration_seconds,
        status=ContentStatus.draft,
    )
    db.add(script)

    if project.status in (ProjectStatus.draft, ProjectStatus.hooks):
        project.status = ProjectStatus.script

    await db.commit()
    await db.refresh(script)
    return script


async def generate_script(
    db: AsyncSession, settings: Settings, creator_id: str, project_id: uuid.UUID
) -> Script:
    """The first script for a project. Returns the existing one untouched if
    there already is one, so arriving at the step twice cannot cost a call."""
    existing = await get_latest_script(db, project_id)
    if existing is not None:
        await project_service.get_owned_project(db, creator_id, project_id)
        return existing
    return await _write_script(db, settings, creator_id, project_id, previous=None)


async def regenerate_script(
    db: AsyncSession, settings: Settings, creator_id: str, project_id: uuid.UUID
) -> Script:
    """
    Another take on the same hook, kept alongside the old one.

    The hook is carried over verbatim: it was chosen a step earlier and a
    regenerate is for a body that did not land, not for undoing that choice.
    """
    previous = await get_latest_script(db, project_id)
    return await _write_script(db, settings, creator_id, project_id, previous=previous)


async def list_script_versions(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID
) -> list[Script]:
    """Every version, newest first — so an earlier take stays reachable."""
    await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(
        select(Script)
        .where(Script.project_id == project_id)
        .order_by(Script.version.desc())
    )
    return list(result.scalars().all())


async def restore_script_version(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID, version: int
) -> Script:
    """
    Brings an earlier version back as the current one.

    Copied forward into a new version rather than deleting what came after:
    changing your mind twice should cost nothing.
    """
    await project_service.get_owned_project(db, creator_id, project_id)
    result = await db.execute(
        select(Script).where(Script.project_id == project_id, Script.version == version)
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise NotFoundError("No such script version for this project.")

    latest = await get_latest_script(db, project_id)
    assert latest is not None  # `source` exists, so at least one version does
    if latest.version == version:
        return latest

    script = Script(
        project_id=project_id,
        creator_id=creator_id,
        version=latest.version + 1,
        title=source.title,
        language=source.language,
        content=source.content,
        estimated_duration_seconds=source.estimated_duration_seconds,
        status=ContentStatus.draft,
    )
    db.add(script)
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


async def reopen_script(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> Script:
    """
    Puts an approved script back into draft so it can be edited again.

    Approving used to be one-way: the editor locked, and the only offered
    route to a wording change was Regenerate - which throws the script away
    and writes a new one from the model. That is a bad trade for fixing a
    line, and it is what someone coming back to a finished project runs into
    first.

    Nothing downstream is touched. A storyboard or a rendered video built
    from the old wording stays exactly where it is; the caller is told it is
    now out of step rather than having it deleted out from under them.
    """
    await project_service.get_owned_project(db, creator_id, project_id)
    script = await get_latest_script(db, project_id)
    if script is None:
        raise NotFoundError("No script has been generated for this project yet.")
    script.status = ContentStatus.draft
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
