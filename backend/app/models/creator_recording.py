import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# The take has to be long enough to hold three angles and short enough that
# nobody is filming a monologue. Both ends are refusals with a readable
# message rather than silent truncation.
MIN_RECORDING_SECONDS = 4.0
MAX_RECORDING_SECONDS = 90.0

# Order matters and is not alphabetical: Veo weights the reference images it
# is given, so the straight-on frame has to land at position 0.
ANGLES = ("front", "left", "right")


class CreatorRecording(Base):
    """
    The live capture a creator's reference frames were cut from.

    Kept after the frames are extracted so an angle can be re-cut without
    asking someone to film themselves again. Deliberately NOT part of
    `assets`, for the same reason `creator_face_images` isn't: assets belong
    to a project and cascade away with it, while a capture outlives every
    project the creator makes.

    One row per creator. A new capture replaces the previous one and deletes
    its file - this is the most personal thing the product stores, and
    keeping every attempt would pile them up for no one's benefit.
    """

    __tablename__ = "creator_recordings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Where each angle was actually confirmed during the session, as
    # [{"angle": "front", "offset_seconds": 1.9, "yaw_degrees": 2.4}, ...].
    # Stored so re-extraction knows where to seek, and so the creator can be
    # shown what the capture measured rather than what it assumed.
    angles: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
