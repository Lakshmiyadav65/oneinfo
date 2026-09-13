import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.script import ContentStatus
from app.schemas.agents import RoadmapStep


class ScriptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version: int
    title: str
    language: str
    content: str
    estimated_duration_seconds: int | None
    # The topics the script was researched from. Null for scripts
    # written before the agent worked them out, which stay readable.
    roadmap: list[RoadmapStep] | None = None
    status: ContentStatus
    created_at: datetime
    updated_at: datetime


class ScriptUpdateIn(BaseModel):
    content: str
    title: str | None = None
