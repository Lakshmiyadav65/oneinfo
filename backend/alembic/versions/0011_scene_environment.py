"""filming setup per scene, and a project default for new ones

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # How the scene is filmed, as structured values rather than prose, so the
    # prompt can be rebuilt from the record whenever the wording improves.
    # Null on existing scenes: they were written before any of this and
    # inventing a setup for them would put words in the creator's mouth. The
    # API fills the default in on read instead.
    op.add_column("storyboard_scenes", sa.Column("environment", sa.JSON(), nullable=True))
    # What the storyboard agent said happens in the shot, kept apart from the
    # composed prompt so changing the setup can rebuild the prompt without
    # losing the part tied to the script.
    op.add_column("storyboard_scenes", sa.Column("visual_action", sa.Text(), nullable=True))
    # Set once a creator edits the visual description by hand. Nothing
    # regenerates over it after that without being asked.
    op.add_column(
        "storyboard_scenes",
        sa.Column(
            "visual_is_custom", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    # Inherited by new scenes so a creator picks their setup once, not once
    # per scene. Null means "the built-in default".
    op.add_column("projects", sa.Column("default_environment", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "default_environment")
    op.drop_column("storyboard_scenes", "visual_is_custom")
    op.drop_column("storyboard_scenes", "visual_action")
    op.drop_column("storyboard_scenes", "environment")
