import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.tanglish_agent import run_tanglish_agent
from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.models.project import ProjectStatus
from app.models.script import ContentStatus
from app.models.tanglish import LocalizedLanguage, TanglishScript
from app.providers.llm import get_llm_provider
from app.services import project_service, script_service


async def get_latest_tanglish(db: AsyncSession, project_id: uuid.UUID) -> TanglishScript | None:
    result = await db.execute(
        select(TanglishScript)
        .where(TanglishScript.project_id == project_id)
        .order_by(TanglishScript.version.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def generate_tanglish(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    project_id: uuid.UUID,
    language: LocalizedLanguage = LocalizedLanguage.tanglish,
) -> TanglishScript:
    project = await project_service.get_owned_project(db, creator_id, project_id)
    english_script = await script_service.get_current_script(db, creator_id, project_id)
    if english_script.status != ContentStatus.approved:
        raise ValidationAppError(
            "Approve the English script before generating a localized version."
        )

    llm = get_llm_provider(settings)
    output = await run_tanglish_agent(
        llm, english_script=english_script.content, language=language
    )

    existing = await get_latest_tanglish(db, project.id)
    if existing is None:
        tanglish = TanglishScript(
            project_id=project.id,
            creator_id=creator_id,
            version=1,
            language=language,
            content=output.script,
        )
        db.add(tanglish)
    elif existing.status == ContentStatus.draft:
        # A draft is still editable, so switching language just replaces it
        # rather than piling up versions the creator never approved.
        existing.content = output.script
        existing.language = language
        tanglish = existing
    else:
        tanglish = TanglishScript(
            project_id=project.id,
            creator_id=creator_id,
            version=existing.version + 1,
            language=language,
            content=output.script,
        )
        db.add(tanglish)

    if project.status == ProjectStatus.script:
        project.status = ProjectStatus.tanglish

    await db.commit()
    await db.refresh(tanglish)
    return tanglish


async def get_current_tanglish(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> TanglishScript:
    await project_service.get_owned_project(db, creator_id, project_id)
    tanglish = await get_latest_tanglish(db, project_id)
    if tanglish is None:
        raise NotFoundError("No Tanglish script has been generated for this project yet.")
    return tanglish


async def update_tanglish(
    db: AsyncSession, creator_id: str, project_id: uuid.UUID, content: str
) -> TanglishScript:
    project = await project_service.get_owned_project(db, creator_id, project_id)
    tanglish = await get_latest_tanglish(db, project.id)
    if tanglish is None:
        raise NotFoundError("No Tanglish script has been generated for this project yet.")
    if tanglish.status == ContentStatus.approved:
        raise ValidationAppError(
            "This Tanglish script is already approved. Regenerate to create a new version."
        )
    tanglish.content = content
    await db.commit()
    await db.refresh(tanglish)
    return tanglish


async def approve_tanglish(db: AsyncSession, creator_id: str, project_id: uuid.UUID) -> TanglishScript:
    project = await project_service.get_owned_project(db, creator_id, project_id)
    tanglish = await get_latest_tanglish(db, project.id)
    if tanglish is None:
        raise NotFoundError("No Tanglish script has been generated for this project yet.")
    tanglish.status = ContentStatus.approved
    await db.commit()
    await db.refresh(tanglish)
    return tanglish
