"""localization language on tanglish_scripts

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-04

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing rows predate multi-language support and are all Tanglish, so
    # backfill with that before dropping the server default — the app always
    # sets the column explicitly from here on.
    op.add_column(
        "tanglish_scripts",
        sa.Column("language", sa.String(), nullable=False, server_default="tanglish"),
    )
    op.create_index(
        "ix_tanglish_scripts_language", "tanglish_scripts", ["language"], unique=False
    )
    op.alter_column("tanglish_scripts", "language", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_tanglish_scripts_language", table_name="tanglish_scripts")
    op.drop_column("tanglish_scripts", "language")
