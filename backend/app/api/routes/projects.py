import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.creator import Creator
from app.models.project import Project
from app.schemas.project import (
    IdeaSuggestionOut,
    IdeaSuggestionsIn,
    IdeaSuggestionsOut,
    ProjectCreateIn,
    ProjectOut,
)
from app.services import idea_service, project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/idea-suggestions", response_model=IdeaSuggestionsOut)
async def suggest_ideas(
    payload: IdeaSuggestionsIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> IdeaSuggestionsOut:
    """
    Ideas for a creator staring at an empty Idea box. Creates no project —
    they pick one, edit it, then create as usual.
    """
    suggestions, grounded = await idea_service.suggest_ideas(
        db, settings, creator.id, payload.language
    )
    return IdeaSuggestionsOut(
        ideas=[IdeaSuggestionOut(text=i.text, angle=i.angle) for i in suggestions.ideas],
        grounded_in_knowledge=grounded,
    )


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreateIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Project:
    return await project_service.create_project(
        db, creator.id, payload.idea, payload.title, payload.language
    )


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    return await project_service.list_projects(db, creator.id)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Project:
    return await project_service.get_owned_project(db, creator.id, project_id)
