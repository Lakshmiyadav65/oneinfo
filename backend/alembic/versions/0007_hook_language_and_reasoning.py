"""project language, plus hook reasoning and creator-written hooks

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing projects were all generated before a language could be chosen,
    # and every one of them produced English hooks — so "english" is the
    # honest backfill, not merely a convenient default.
    op.add_column(
        "projects",
        sa.Column("language", sa.String(), nullable=False, server_default="english"),
    )

    # Why the agent picked a hook. Null on existing rows: those were generated
    # before the agent was asked to explain itself, and inventing a rationale
    # after the fact would attribute reasoning it never did.
    op.add_column("hooks", sa.Column("reason", sa.String(), nullable=True))
    op.add_column(
        "hooks",
        sa.Column("is_recommended", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Distinguishes a hook the creator wrote from one the agent generated, so
    # regenerating can wipe the agent's suggestions without destroying
    # something the creator typed themselves.
    op.add_column(
        "hooks",
        sa.Column("is_custom", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("hooks", "is_custom")
    op.drop_column("hooks", "is_recommended")
    op.drop_column("hooks", "reason")
    op.drop_column("projects", "language")
