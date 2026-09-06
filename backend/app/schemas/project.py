import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.project import ProjectStatus


class ProjectCreateIn(BaseModel):
    idea: str
    title: str | None = None
    language: Literal["english", "tenglish", "telugu"] = "english"


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
