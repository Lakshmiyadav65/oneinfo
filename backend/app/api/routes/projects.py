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
    ProjectUpdateIn,
)
from app.schemas.output_settings import OutputSettings
from app.schemas.storyboard import ProjectEnvironmentIn
from app.services import idea_service, project_service, storyboard_service

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


@router.patch("/{project_id}/output-settings", response_model=ProjectOut)
async def set_output_settings(
    project_id: uuid.UUID,
    payload: OutputSettings,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """
    Changes what this project generates at: shape, resolution, model tier and
    how many takes of each scene.

    Nothing already generated is re-rendered. Clips made at the old settings
    stay as they are until the creator asks for a new run, because redoing
    them here would spend money they did not agree to spend.
    """
    return await project_service.set_output_settings(db, creator.id, project_id, payload)


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


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdateIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Project:
    return await project_service.update_language(db, creator.id, project_id, payload.language)


@router.patch("/{project_id}/environment", response_model=ProjectOut)
async def set_project_environment(
    project_id: uuid.UUID,
    payload: ProjectEnvironmentIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """
    The setup new scenes inherit. `apply_to_all` also rewrites the scenes
    that already exist, leaving alone any whose visual the creator wrote.
    """
    return await storyboard_service.set_project_environment(
        db,
        creator.id,
        project_id,
        payload.environment,
        apply_to_all=payload.apply_to_all,
        reset_to_preset=payload.reset_to_preset,
    )
