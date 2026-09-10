"""a run that only stitches the clips already generated

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Defaulted false so every existing job stays what it was: a real run
    # that called the provider.
    op.add_column(
        "generation_jobs",
        sa.Column("stitch_only", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("generation_jobs", "stitch_only")
