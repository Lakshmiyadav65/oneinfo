"""date a finished video by its latest render, not its first

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # One row per project, reused on every re-render, so created_at records
    # when the project first produced a video and says nothing about the file
    # currently stored. Existing rows start equal to created_at: that is the
    # only render date on record for them.
    op.add_column(
        "video_outputs",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE video_outputs SET updated_at = created_at")
    op.alter_column(
        "video_outputs",
        "updated_at",
        nullable=False,
        server_default=sa.func.now(),
    )


def downgrade() -> None:
    op.drop_column("video_outputs", "updated_at")
