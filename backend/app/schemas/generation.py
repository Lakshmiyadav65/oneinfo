import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.generation_job import JobStatus


class GenerationJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: JobStatus
    current_stage: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class VideoOutputOut(BaseModel):
    id: uuid.UUID
    mime_type: str
    duration_seconds: float | None
    file_size_bytes: int | None
    url: str
