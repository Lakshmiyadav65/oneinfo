import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectStatus(str, enum.Enum):
    draft = "draft"
    hooks = "hooks"
    script = "script"
    tanglish = "tanglish"
    storyboard = "storyboard"
    generating = "generating"
    completed = "completed"
    failed = "failed"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    idea: Mapped[str] = mapped_column(Text, nullable=False)
    # Output language for hooks and script. Chosen up front rather than at
    # the later Language step: a creator whose audience is Telugu cannot
    # judge an English hook without translating it first.
    language: Mapped[str] = mapped_column(String, nullable=False, default="english")
    status: Mapped[ProjectStatus] = mapped_column(
        String, nullable=False, default=ProjectStatus.draft, index=True
    )
    selected_hook_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hooks.id", ondelete="SET NULL"), nullable=True
    )

    # Idea/Research Agent output — computed once during hook generation,
    # cached here so later agents (script) can reuse it without a re-call.
    research_topic: Mapped[str | None] = mapped_column(String, nullable=True)
    research_audience: Mapped[str | None] = mapped_column(String, nullable=True)
    research_goal: Mapped[str | None] = mapped_column(String, nullable=True)
    research_angle: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
