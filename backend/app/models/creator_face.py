import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Veo accepts at most three subject reference images per request, and the
# docs are clear that 2-3 beat a single photo for likeness. The limit lives
# here rather than in the provider because the upload endpoint has to reject
# a fourth photo long before generation ever runs.
MAX_FACE_IMAGES = 3


class CreatorFaceImage(Base):
    """
    A reference photo of the creator, used as a Veo subject reference so
    generated scenes show them rather than a stranger.

    Stored as an ordinary storage object like every other asset. Deliberately
    NOT part of `assets`: those belong to a project and cascade away with it,
    while a face outlives every project the creator makes.
    """

    __tablename__ = "creator_face_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    # Lowest first. Veo weights the images it is given, so the creator's
    # best straight-on shot should be position 0.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # The capture this frame was grabbed from, and which way the head was
    # turned when it was. Both null for an uploaded photo, which is what
    # every row written before the capture flow existed is.
    #
    # SET NULL rather than CASCADE: a frame outlives the capture it came
    # from. Deleting someone's recording should not delete the reference set
    # that was cut from it.
    recording_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("creator_recordings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    angle: Mapped[str | None] = mapped_column(String, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
