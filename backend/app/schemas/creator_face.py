import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CreatorFaceImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    mime_type: str
    width: int | None
    height: int | None
    file_size_bytes: int | None
    created_at: datetime


class FaceSetupOut(BaseModel):
    """Everything the UI needs to show the face step's state in one call."""

    images: list[CreatorFaceImageOut]
    max_images: int
    consent_granted: bool
    consent_at: datetime | None
    appearance_description: str | None
    voice_description: str | None
    # False whenever generation would refuse: no photos, or no consent.
    ready_for_generation: bool


class FaceDescriptionsIn(BaseModel):
    appearance_description: str | None = None
    voice_description: str | None = None
