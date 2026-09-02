import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

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
