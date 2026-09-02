import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.script import ContentStatus


class TanglishOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version: int
    content: str
    status: ContentStatus
    created_at: datetime
    updated_at: datetime


class TanglishUpdateIn(BaseModel):
    content: str
