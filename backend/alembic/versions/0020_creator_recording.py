"""keep the capture a creator's reference frames were cut from

Revision ID: 0020
Revises: 0019
Create Date: 2026-09-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "creator_recordings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "creator_id",
            sa.String(),
            sa.ForeignKey("creators.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        # Where each angle was confirmed during the session. Server default
        # so a row written by anything that predates the column still reads
        # back as a list rather than null.
        sa.Column("angles", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_creator_recordings_creator_id", "creator_recordings", ["creator_id"])

    # Null on every existing reference photo, which is the honest answer:
    # they were uploaded from a file picker, not cut from a capture.
    #
    # SET NULL rather than CASCADE. A frame outlives the capture it came
    # from - deleting a recording must not take the reference set with it.
    op.add_column(
        "creator_face_images",
        sa.Column("recording_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("creator_face_images", sa.Column("angle", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_creator_face_images_recording_id",
        "creator_face_images",
        "creator_recordings",
        ["recording_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_creator_face_images_recording_id", "creator_face_images", ["recording_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_creator_face_images_recording_id", table_name="creator_face_images")
    op.drop_constraint(
        "fk_creator_face_images_recording_id", "creator_face_images", type_="foreignkey"
    )
    op.drop_column("creator_face_images", "angle")
    op.drop_column("creator_face_images", "recording_id")
    op.drop_index("ix_creator_recordings_creator_id", table_name="creator_recordings")
    op.drop_table("creator_recordings")
