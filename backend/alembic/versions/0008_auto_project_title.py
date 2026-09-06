"""track whether a project title was auto-derived

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Marks a title the creator did not write. Those get replaced with the
    # research agent's topic once it runs, turning a truncated idea into a
    # real name; a title someone typed is never overwritten.
    #
    # False for every existing row. Some of those were auto-derived too, but
    # there is no way to tell now — and silently renaming a project someone
    # named themselves is the worse mistake.
    op.add_column(
        "projects",
        sa.Column("title_is_auto", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("projects", "title_is_auto")
