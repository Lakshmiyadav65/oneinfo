"""remember which run produced a clip, so the one before it can be kept

Revision ID: 0019
Revises: 0018
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Null on every clip generated before this, which is the honest answer:
    # those were written when a re-run deleted whatever came before it, so
    # there is no earlier run of theirs left to point at.
    #
    # SET NULL rather than CASCADE. The clip outlives the record of the run
    # that made it - losing the grouping is a worse outcome than losing a
    # paid-for video.
    op.add_column(
        "assets",
        sa.Column("generation_job_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_assets_generation_job_id",
        "assets",
        "generation_jobs",
        ["generation_job_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_assets_generation_job_id", "assets", ["generation_job_id"])


def downgrade() -> None:
    op.drop_index("ix_assets_generation_job_id", table_name="assets")
    op.drop_constraint("fk_assets_generation_job_id", "assets", type_="foreignkey")
    op.drop_column("assets", "generation_job_id")
