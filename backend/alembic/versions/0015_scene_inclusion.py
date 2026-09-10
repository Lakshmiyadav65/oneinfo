"""leaving a scene out of the finished video without deleting it

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Defaulted true, so every existing scene stays in the video it is
    # already part of.
    op.add_column(
        "storyboard_scenes",
        sa.Column("included_in_video", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("storyboard_scenes", "included_in_video")
