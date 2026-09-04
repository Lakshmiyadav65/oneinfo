import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.creator import Creator
from app.models.tanglish import TanglishScript
from app.schemas.tanglish import TanglishGenerateIn, TanglishOut, TanglishUpdateIn
from app.services import tanglish_service

router = APIRouter(prefix="/projects/{project_id}/tanglish", tags=["tanglish"])


@router.post("/generate", response_model=TanglishOut)
async def generate_tanglish(
    project_id: uuid.UUID,
    # Defaulted so an omitted body still means Tanglish, matching the
    # behaviour before the language choice existed.
    payload: TanglishGenerateIn = TanglishGenerateIn(),
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TanglishScript:
    return await tanglish_service.generate_tanglish(
        db, settings, creator.id, project_id, payload.language
    )


@router.get("", response_model=TanglishOut)
async def get_tanglish(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> TanglishScript:
    return await tanglish_service.get_current_tanglish(db, creator.id, project_id)


@router.patch("", response_model=TanglishOut)
async def update_tanglish(
    project_id: uuid.UUID,
    payload: TanglishUpdateIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> TanglishScript:
    return await tanglish_service.update_tanglish(db, creator.id, project_id, payload.content)


@router.post("/approve", response_model=TanglishOut)
async def approve_tanglish(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> TanglishScript:
    return await tanglish_service.approve_tanglish(db, creator.id, project_id)
