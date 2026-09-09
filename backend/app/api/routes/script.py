import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.creator import Creator
from app.models.script import Script
from app.schemas.script import ScriptOut, ScriptUpdateIn
from app.services import script_service

router = APIRouter(prefix="/projects/{project_id}/script", tags=["script"])


@router.post("/generate", response_model=ScriptOut)
async def generate_script(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Script:
    return await script_service.generate_script(db, settings, creator.id, project_id)


@router.post("/regenerate", response_model=ScriptOut)
async def regenerate_script(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Script:
    return await script_service.regenerate_script(db, settings, creator.id, project_id)


@router.get("/versions", response_model=list[ScriptOut])
async def list_script_versions(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> list[Script]:
    """Every take written for this project, newest first."""
    return await script_service.list_script_versions(db, creator.id, project_id)


@router.post("/versions/{version}/restore", response_model=ScriptOut)
async def restore_script_version(
    project_id: uuid.UUID,
    version: int,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Script:
    """Copies an earlier version forward so it becomes the current one."""
    return await script_service.restore_script_version(db, creator.id, project_id, version)


@router.get("", response_model=ScriptOut)
async def get_script(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Script:
    return await script_service.get_current_script(db, creator.id, project_id)


@router.patch("", response_model=ScriptOut)
async def update_script(
    project_id: uuid.UUID,
    payload: ScriptUpdateIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Script:
    return await script_service.update_script(db, creator.id, project_id, payload.content, payload.title)


@router.post("/reopen", response_model=ScriptOut)
async def reopen_script(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Script:
    """Unlocks an approved script for editing, without regenerating it."""
    return await script_service.reopen_script(db, creator.id, project_id)


@router.post("/approve", response_model=ScriptOut)
async def approve_script(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Script:
    return await script_service.approve_script(db, creator.id, project_id)
