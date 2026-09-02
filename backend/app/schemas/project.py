import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.project import ProjectStatus


class ProjectCreateIn(BaseModel):
    idea: str
    title: str | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    idea: str
    status: ProjectStatus
    selected_hook_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
