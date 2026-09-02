import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.script import ContentStatus


class ScriptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version: int
    title: str
    language: str
    content: str
    estimated_duration_seconds: int | None
    status: ContentStatus
    created_at: datetime
    updated_at: datetime


class ScriptUpdateIn(BaseModel):
    content: str
    title: str | None = None
