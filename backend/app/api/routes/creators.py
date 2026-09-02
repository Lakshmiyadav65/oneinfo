from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_creator
from app.models.creator import Creator
from app.schemas.creator import CreatorOut

router = APIRouter(prefix="/creators", tags=["creators"])


@router.get("/me", response_model=CreatorOut)
async def get_me(creator: Creator = Depends(get_current_creator)) -> Creator:
    return creator
