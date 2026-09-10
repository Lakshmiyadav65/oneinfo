import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Storyboard(Base):
    __tablename__ = "storyboards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # QA Agent result — validates structure only, never mutates content.
    qa_passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    qa_issues: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    scenes: Mapped[list["StoryboardScene"]] = relationship(
        back_populates="storyboard", cascade="all, delete-orphan", order_by="StoryboardScene.order"
    )


class StoryboardScene(Base):
    __tablename__ = "storyboard_scenes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    storyboard_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("storyboards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    voiceover: Mapped[str] = mapped_column(Text, nullable=False)
    visual_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    caption: Mapped[str] = mapped_column(Text, nullable=False)
    # What the storyboard agent said happens in the shot, kept apart from the
    # composed visual_prompt so a change of setup can rebuild the prompt
    # without losing the part that is tied to the script.
    visual_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    # True once the creator has edited the visual description themselves.
    # Nothing rebuilds over it after that without asking first.
    visual_is_custom: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # The filming setup, as structured values. See schemas/environment.py.
    # Null on scenes written before setups existed; read as the default.
    environment: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Whether this scene goes into the finished video. A scene left out is
    # kept, not deleted: the creator may want it back, and if it was already
    # generated then deleting it would throw away something they paid for.
    # It is also skipped when generating, so excluding a scene the creator
    # does not want stops them paying to make it in the first place.
    included_in_video: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Which take of this scene the final video uses, when more than one was
    # generated. Zero-based, and left at 0 unless the creator picks another:
    # a run with takes=1 has exactly one, and nothing to choose between.
    selected_take: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Whether the creator is on camera in this scene. Drives both look and
    # cost: only these scenes attach face references, and only these pay the
    # reference model's rate (3-8x the Lite tier). B-roll stays cheap.
    features_creator: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    storyboard: Mapped[Storyboard] = relationship(back_populates="scenes")
