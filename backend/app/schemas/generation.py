import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.generation_job import JobStatus


class GenerationJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # Null for a full render, set for a single-scene preview. The UI needs
    # the difference: the two produce very different deliverables.
    scene_id: uuid.UUID | None
    status: JobStatus
    current_stage: str | None
    scenes_total: int | None
    scenes_completed: int | None
    # True for a free run that only combined clips already on hand.
    stitch_only: bool = False
    # Set when the run was an export, so the UI can name the frame it is
    # producing rather than calling every free run "combining".
    export_aspect_ratio: str | None = None
    error_message: str | None
    error_detail: str | None
    created_at: datetime
    updated_at: datetime


class VideoOutputOut(BaseModel):
    id: uuid.UUID
    mime_type: str
    duration_seconds: float | None
    file_size_bytes: int | None
    url: str


class SceneTakeOut(BaseModel):
    """One clip on hand for a scene."""

    model_config = ConfigDict(from_attributes=True)

    take_index: int
    # The run that produced it. Two clips sharing this came out of the same
    # generation and cost one price between them; clips with different ids
    # are the new attempt and the one it replaced, which is the comparison
    # the creator is actually making. Null on clips generated before runs
    # were recorded.
    generation_job_id: uuid.UUID | None = None
    created_at: datetime


class SceneTakesOut(BaseModel):
    """
    What there is to choose between for one scene, and what is chosen.

    A list rather than a count. Take indices count up across runs and older
    runs are eventually dropped, so they are not 0..n-1 and never were safe
    to infer - a scene on its second run holds takes 1 and 2, not 0 and 1.
    """

    takes: list[SceneTakeOut]
    selected_take: int


class StitchReadinessOut(BaseModel):
    """Whether the clips on hand can be combined, and what is missing."""

    scenes_total: int
    scenes_ready: int
    # Scene numbers with no clip yet. Empty means combining is available.
    missing_scenes: list[int]

