"""remember the shape a run was asked to export at

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Null on every run so far, and on every ordinary one from here: it means
    # "the shape this project generates at", which is what stitching has
    # always used. Only an export names something else, and it names it per
    # run rather than by changing the project - exporting for YouTube must
    # not quietly decide what the next scene is generated as.
    op.add_column(
        "generation_jobs", sa.Column("export_aspect_ratio", sa.String(), nullable=True)
    )
    op.add_column(
        "generation_jobs", sa.Column("export_resolution", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("generation_jobs", "export_resolution")
    op.drop_column("generation_jobs", "export_aspect_ratio")
