import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.project import ProjectStatus
from app.schemas.environment import SceneEnvironment


class ProjectCreateIn(BaseModel):
    idea: str
    title: str | None = None
    # Omitted by the UI, which no longer asks: the language picker moved to
    # the workflow header. None means "carry over whatever they made last
    # time" rather than "english" — see project_service.create_project.
    language: Literal["english", "tenglish", "telugu"] | None = None


class ProjectUpdateIn(BaseModel):
    language: Literal["english", "tenglish", "telugu"]


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    idea: str
    language: str
    status: ProjectStatus
    selected_hook_id: uuid.UUID | None = None
    # The filming setup new scenes inherit. Defaulted rather than nullable,
    # so the UI never has to render an absent setup.
    default_environment: SceneEnvironment = SceneEnvironment()

    @field_validator("default_environment", mode="before")
    @classmethod
    def _default_environment(cls, value: object) -> object:
        # Null on projects created before setups existed.
        return value or {}
    created_at: datetime
    updated_at: datetime


class IdeaSuggestionOut(BaseModel):
    text: str
    angle: str


class IdeaSuggestionsOut(BaseModel):
    ideas: list[IdeaSuggestionOut]
    # False when the creator has filed no knowledge yet: the suggestions are
    # then generic rather than drawn from their own material, and the UI says
    # so instead of implying a personalisation that did not happen.
    grounded_in_knowledge: bool


class IdeaSuggestionsIn(BaseModel):
    language: Literal["english", "tenglish", "telugu"] = "english"
