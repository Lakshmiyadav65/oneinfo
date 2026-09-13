import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class CreatorFaceImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    mime_type: str
    width: int | None
    height: int | None
    file_size_bytes: int | None
    # "front", "left" or "right" when this frame came from a capture. Null
    # for a photo the creator uploaded, which is every image predating it.
    angle: str | None
    created_at: datetime


class CreatorRecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    mime_type: str
    duration_seconds: float | None
    width: int | None
    height: int | None
    file_size_bytes: int | None
    angles: list[dict[str, Any]]
    created_at: datetime


class FaceSetupOut(BaseModel):
    """Everything the UI needs to show the face step's state in one call."""

    images: list[CreatorFaceImageOut]
    max_images: int
    consent_granted: bool
    consent_at: datetime | None
    appearance_description: str | None
    voice_description: str | None
    # Which synthesised voice speaks this creator's videos, and the voices
    # they can choose between. Null means the deployment's configured
    # default, which is what every creator had before there was a choice.
    speech_speaker: str | None
    speech_speakers: list[str]
    # The capture the images were cut from, when there is one. Null means
    # they were uploaded, or the creator deleted the recording and kept the
    # frames.
    recording: CreatorRecordingOut | None
    # False whenever generation would refuse: no photos, or no consent.
    ready_for_generation: bool


class ReextractIn(BaseModel):
    # Omitted means re-cut at the moments the capture already recorded, which
    # is how a creator retries a frame that came out badly without having to
    # nominate new ones.
    angles: list[dict[str, Any]] | None = None


class FaceDescriptionsIn(BaseModel):
    appearance_description: str | None = None
    voice_description: str | None = None
    # Chosen from FaceSetupOut.speech_speakers. Validated against the
    # provider rather than here, since which voices exist depends on which
    # speech model the deployment runs.
    speech_speaker: str | None = None
