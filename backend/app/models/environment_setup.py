import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EnvironmentSetup(Base):
    """
    A filming setup the creator saved and can reuse on any project.

    Deliberately not a KnowledgeDocument. Knowledge is prose that gets
    chunked, embedded and retrieved by similarity, which is the right shape
    for "what do I know about hackathons" and the wrong shape for a camera
    angle: a setup has to be applied exactly as saved, never approximately
    matched. It lives under Knowledge in the UI because that is where a
    creator's cross-project material belongs, but it is stored as the same
    structured values a scene carries, so applying one is a copy rather than
    an interpretation.
    """

    __tablename__ = "environment_setups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(
        String, ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # What the creator calls it: "Campus walk-and-talk", "Hackathon floor".
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Optional note on when to reach for this one, shown under the name.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The setup itself, in the same shape as SceneEnvironment, so it can be
    # applied to a scene or a project without conversion.
    environment: Mapped[dict] = mapped_column(JSON, nullable=False)
    # The setup new projects start from. At most one per creator, enforced in
    # the service rather than by a constraint: switching the flag between two
    # rows is a two-step write, and a partial unique index would reject the
    # intermediate state.
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
