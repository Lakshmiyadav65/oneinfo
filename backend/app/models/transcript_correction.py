import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TranscriptCorrection(Base):
    """
    A word this creator's transcriber reliably gets wrong, and what it
    should say instead.

    Speech models fail at names in a specific, repeatable way: a product or a
    brand said quickly comes back as the nearest thing the model has heard
    before, and it comes back that way every single time. "Mac Mini" became
    "MagMain" twice in one twenty-second reel, and would have again in the
    next reel, and the one after that.

    So a correction is worth remembering rather than re-making. Fixing it in
    one transcript fixes that transcript; fixing it here fixes every
    transcript from then on.

    Deliberately not a KnowledgeDocument: this is applied exactly, as a
    substitution, never retrieved approximately by similarity.
    """

    __tablename__ = "transcript_corrections"
    __table_args__ = (
        # One rule per misheard word per creator. Lower-cased on the way in,
        # since the substitution ignores case anyway and two rows differing
        # only in capitalisation would fight over the same text.
        UniqueConstraint("creator_id", "heard", name="uq_correction_creator_heard"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # What the transcriber produced, lower-cased.
    heard: Mapped[str] = mapped_column(String, nullable=False)
    # What the creator actually said, kept exactly as they typed it — this is
    # what gets written into the transcript, so its capitalisation matters.
    corrected: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
