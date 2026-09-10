import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.db.session import get_db
from app.models.creator import Creator
from app.models.environment_setup import EnvironmentSetup
from app.schemas.environment_setup import (
    EnvironmentSetupIn,
    EnvironmentSetupOut,
    EnvironmentSetupUpdateIn,
)
from app.services import environment_setup_service

# Under /knowledge because that is what these are to a creator: their own
# reusable material, kept between projects, alongside the documents they
# have filed. Stored separately from KnowledgeDocument all the same - see
# the model for why a setup is not something to embed and retrieve.
router = APIRouter(prefix="/knowledge/environment-setups", tags=["environment-setups"])


@router.get("", response_model=list[EnvironmentSetupOut])
async def list_environment_setups(
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> list[EnvironmentSetup]:
    return await environment_setup_service.list_setups(db, creator.id)


@router.post("", response_model=EnvironmentSetupOut, status_code=201)
async def create_environment_setup(
    payload: EnvironmentSetupIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> EnvironmentSetup:
    return await environment_setup_service.create_setup(
        db,
        creator.id,
        name=payload.name,
        description=payload.description,
        environment=payload.environment,
        is_default=payload.is_default,
    )


@router.patch("/{setup_id}", response_model=EnvironmentSetupOut)
async def update_environment_setup(
    setup_id: uuid.UUID,
    payload: EnvironmentSetupUpdateIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> EnvironmentSetup:
    return await environment_setup_service.update_setup(
        db,
        creator.id,
        setup_id,
        name=payload.name,
        description=payload.description,
        environment=payload.environment,
        is_default=payload.is_default,
    )


@router.delete("/{setup_id}", status_code=204)
async def delete_environment_setup(
    setup_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> None:
    await environment_setup_service.delete_setup(db, creator.id, setup_id)
