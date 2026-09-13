"""let a creator choose a scene's clip length instead of deriving it

Revision ID: 0024
Revises: 0023
Create Date: 2026-09-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # duration_seconds is what generation actually asks Veo for. This is the
    # creator's say in it: null means "work it out from the dialogue", which
    # is what every scene did before and still does by default.
    #
    # Kept separate from duration_seconds rather than replacing it, because
    # the two answer different questions. duration_seconds must always hold a
    # length Veo will accept; this holds whether anybody chose it. Without
    # the distinction the panel cannot tell a length that was picked from one
    # that was computed, and Auto stops being a state you can return to.
    op.add_column(
        "storyboard_scenes", sa.Column("duration_override", sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("storyboard_scenes", "duration_override")
