import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.core.errors import ValidationAppError
from app.db.session import get_db
from app.models.creator import Creator
from app.models.hook import Hook
from app.schemas.hook import HookCreateIn, HookOut
from app.services import hook_service

router = APIRouter(prefix="/projects/{project_id}/hooks", tags=["hooks"])


@router.post("/generate", response_model=list[HookOut])
async def generate_hooks(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[Hook]:
    return await hook_service.generate_hooks(db, settings, creator.id, project_id)


@router.post("/regenerate", response_model=list[HookOut])
async def regenerate_hooks(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[Hook]:
    return await hook_service.generate_hooks(db, settings, creator.id, project_id)


@router.post("", response_model=HookOut, status_code=201)
async def add_custom_hook(
    project_id: uuid.UUID,
    payload: HookCreateIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Hook:
    if not payload.text.strip():
        raise ValidationAppError("Write the hook first.")
    return await hook_service.add_custom_hook(db, creator.id, project_id, payload.text)


@router.get("", response_model=list[HookOut])
async def list_hooks(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> list[Hook]:
    return await hook_service.list_hooks(db, creator.id, project_id)


@router.post("/{hook_id}/select", response_model=HookOut)
async def select_hook(
    project_id: uuid.UUID,
    hook_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Hook:
    return await hook_service.select_hook(db, creator.id, project_id, hook_id)
