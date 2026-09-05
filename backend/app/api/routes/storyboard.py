import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.creator import Creator
from app.models.storyboard import Storyboard
from app.schemas.storyboard import SceneOnCameraIn, StoryboardOut
from app.services import storyboard_service

router = APIRouter(prefix="/projects/{project_id}/storyboard", tags=["storyboard"])


@router.post("/generate", response_model=StoryboardOut)
async def generate_storyboard(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Storyboard:
    return await storyboard_service.generate_storyboard(db, settings, creator.id, project_id)


@router.get("", response_model=StoryboardOut)
async def get_storyboard(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Storyboard:
    return await storyboard_service.get_storyboard(db, creator.id, project_id)


@router.patch("/scenes/{scene_id}", response_model=StoryboardOut)
async def set_scene_on_camera(
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
    payload: SceneOnCameraIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Storyboard:
    return await storyboard_service.set_scene_on_camera(
        db, settings, creator.id, project_id, scene_id, payload.features_creator
    )
