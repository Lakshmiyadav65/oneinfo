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
    # None means "follow the project's language". An explicit value lets a
    # creator localize into something other than what the project was
    # written in.
    language: LocalizedLanguage | None = None


class TanglishUpdateIn(BaseModel):
    content: str
