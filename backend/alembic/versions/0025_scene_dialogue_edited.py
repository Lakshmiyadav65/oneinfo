"""record when a creator rewrote a scene's spoken line

Revision ID: 0025
Revises: 0024
Create Date: 2026-09-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The line itself already had a home. What was missing was *when* it
    # last changed, and that is the only thing that can tell a clip which
    # still says what the scene says from one that says what the scene used
    # to say. Both sit in the same take list looking identical.
    #
    # Null on every scene written by the storyboard agent, which is correct:
    # nobody has rewritten it, so no clip can be behind it.
    op.add_column(
        "storyboard_scenes",
        sa.Column("dialogue_edited_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("storyboard_scenes", "dialogue_edited_at")
