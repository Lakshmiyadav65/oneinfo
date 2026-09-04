import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.script import ContentStatus
from app.models.tanglish import LocalizedLanguage


class TanglishOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version: int
    language: LocalizedLanguage
    content: str
    status: ContentStatus
    created_at: datetime
    updated_at: datetime


class TanglishGenerateIn(BaseModel):
    language: LocalizedLanguage = LocalizedLanguage.tanglish


class TanglishUpdateIn(BaseModel):
    content: str
