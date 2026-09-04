import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.script import ContentStatus


class LocalizedLanguage(str, enum.Enum):
    """
    Languages the localization step can adapt an approved English script
    into. `telugu` is the only one written in a non-Latin script, which is
    why captions need a Telugu-capable font (see settings.caption_font_path).
    """

    tanglish = "tanglish"  # Tamil-English code-mixed, Latin script
    tenglish = "tenglish"  # Telugu-English code-mixed, Latin script
    telugu = "telugu"  # Pure Telugu, తెలుగు script


class TanglishScript(Base):
    # Table/route naming predates multi-language support (it was Tanglish-only);
    # kept as-is to avoid a rename migration across the whole stack. The
    # `language` column is what actually decides the output language now.
    __tablename__ = "tanglish_scripts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    language: Mapped[LocalizedLanguage] = mapped_column(
        String, nullable=False, default=LocalizedLanguage.tanglish, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ContentStatus] = mapped_column(
        String, nullable=False, default=ContentStatus.draft, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
