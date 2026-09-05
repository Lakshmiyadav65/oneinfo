import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Creator(Base):
    """
    Primary key mirrors the authenticated identity: a Supabase auth user id
    (uuid string) in production, or a fixed dev id ("creator-a"/"creator-b")
    when running in dev-mock auth mode. Never generated client-side.
    """

    __tablename__ = "creators"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Set when the creator explicitly agrees to their likeness being used to
    # generate video. Generation with a face reference is refused while this
    # is null: it is the line between this product and a deepfake tool, so it
    # is recorded as a fact with a time, never inferred from an upload.
    face_consent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Repeated verbatim into every on-camera scene prompt. Veo has no memory
    # between clips, so identical wording is the only thing keeping the
    # creator's look and voice stable from one scene to the next.
    appearance_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    voice_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
