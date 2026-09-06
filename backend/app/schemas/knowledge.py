import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.knowledge import KnowledgeSourceType, KnowledgeStatus


class KnowledgeDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    source_type: KnowledgeSourceType
    status: KnowledgeStatus
    error_message: str | None = None
    created_at: datetime


class KnowledgeTextIn(BaseModel):
    title: str
    content: str


class KnowledgeStructureIn(BaseModel):
    """A raw paste to be reorganised — no title, the agent proposes one per section."""

    content: str


class KnowledgeSectionOut(BaseModel):
    title: str
    content: str


class KnowledgeStructureOut(BaseModel):
    sections: list[KnowledgeSectionOut]
    truncated: bool = False


class KnowledgeBulkIn(BaseModel):
    documents: list[KnowledgeTextIn] = Field(min_length=1, max_length=15)
