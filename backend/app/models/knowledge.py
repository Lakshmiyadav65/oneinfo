import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import get_settings
from app.db.base import Base


class KnowledgeSourceType(str, enum.Enum):
    pdf = "pdf"
    docx = "docx"
    txt = "txt"
    text = "text"
    # What a creator said on camera, transcribed. `reel` came from a link,
    # `video` from a file they uploaded — the same text either way, but the
    # distinction is worth keeping: only one of them has a URL to go back to.
    reel = "reel"
    video = "video"


class KnowledgeStatus(str, enum.Enum):
    processing = "processing"
    ready = "ready"
    failed = "failed"


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[KnowledgeSourceType] = mapped_column(
        String, nullable=False, default=KnowledgeSourceType.text
    )
    status: Mapped[KnowledgeStatus] = mapped_column(
        String, nullable=False, default=KnowledgeStatus.processing, index=True
    )
    storage_key: Mapped[str | None] = mapped_column(String, nullable=True)
    # Set when this document came from a web page the creator pasted. Used to
    # recognise a link that has already been read, so pasting the same URL
    # into a second project costs neither a fetch nor a model call.
    source_url: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    # The takeaways pulled from that page, kept apart from the chunked text.
    # Retrieval is a similarity search and can miss; a project whose whole
    # idea is one link cannot afford to be told about that link only when
    # the embedding happens to match.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    chunks: Mapped[list["KnowledgeChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Denormalized from the parent document so retrieval can filter on
    # creator_id directly, without a join, per the RAG isolation spec.
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(
        Vector(get_settings().embedding_dimensions), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped[KnowledgeDocument] = relationship(back_populates="chunks")
