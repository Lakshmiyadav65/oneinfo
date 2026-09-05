"""creator face references, likeness consent, and per-scene on-camera flag

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "creator_face_images",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "creator_id",
            sa.String(),
            sa.ForeignKey("creators.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_creator_face_images_creator_id", "creator_face_images", ["creator_id"], unique=False
    )

    op.add_column("creators", sa.Column("face_consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("creators", sa.Column("appearance_description", sa.Text(), nullable=True))
    op.add_column("creators", sa.Column("voice_description", sa.Text(), nullable=True))

    # Existing storyboards are all b-roll: they were generated before the
    # creator could be on camera at all. Backfill false, then drop the
    # default so the app states it explicitly from here on.
    op.add_column(
        "storyboard_scenes",
        sa.Column("features_creator", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("storyboard_scenes", "features_creator", server_default=None)


def downgrade() -> None:
    op.drop_column("storyboard_scenes", "features_creator")
    op.drop_column("creators", "voice_description")
    op.drop_column("creators", "appearance_description")
    op.drop_column("creators", "face_consent_at")
    op.drop_index("ix_creator_face_images_creator_id", table_name="creator_face_images")
    op.drop_table("creator_face_images")
