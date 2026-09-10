"""per-project output settings, and keeping every take of a scene

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Shape, resolution, model tier and take count. Nullable rather than
    # defaulted: a project created before the panel existed has made no
    # choice, and reading null as "the defaults" keeps that distinction.
    op.add_column("projects", sa.Column("output_settings", sa.JSON(), nullable=True))

    # Which take the final video uses. Defaulted to the first, so every
    # existing scene keeps rendering exactly the clip it rendered before.
    op.add_column(
        "storyboard_scenes",
        sa.Column("selected_take", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "assets",
        sa.Column("take_index", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("assets", "take_index")
    op.drop_column("storyboard_scenes", "selected_take")
    op.drop_column("projects", "output_settings")
