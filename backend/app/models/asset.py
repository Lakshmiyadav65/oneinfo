import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AssetType(str, enum.Enum):
    scene_video = "scene_video"
    scene_audio = "scene_audio"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scene_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("storyboard_scenes.id", ondelete="CASCADE"), nullable=False
    )
    asset_type: Mapped[AssetType] = mapped_column(String, nullable=False)
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    # The run that produced this clip, or null for one generated before the
    # column existed. What it buys is the grouping: a scene keeps the clips
    # from its last two runs so the creator can see the new one beside the
    # one it replaced, and "which run" is the only way to tell those apart.
    generation_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("generation_jobs.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    # Which take this is. Zero-based and counting up across runs, never
    # restarting: two runs of the same scene both starting at zero would
    # collide on the storage key and leave `selected_take` naming two
    # different clips. Every take is kept - they were all paid for, and the
    # point of asking for four is to choose between them afterwards.
    take_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
