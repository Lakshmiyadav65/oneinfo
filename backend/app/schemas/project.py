import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.project import ProjectStatus
from app.schemas.environment import SceneEnvironment
from app.schemas.output_settings import OutputSettings


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

    # What the video generates at. Defaulted rather than nullable for the
    # same reason as the setup above: the panel never has to render an
    # absent value.
    output_settings: OutputSettings = OutputSettings()

    @field_validator("default_environment", mode="before")
    @classmethod
    def _default_environment(cls, value: object) -> object:
        # Null on projects created before setups existed.
        return value or {}

    @field_validator("output_settings", mode="before")
    @classmethod
    def _output_settings(cls, value: object) -> object:
        # Null on projects created before the panel existed.
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
