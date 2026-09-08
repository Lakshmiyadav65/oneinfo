"""scene progress and raw failure detail on generation jobs

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # How far a run actually got. current_stage already said "Generating
    # scene 3 of 6", but only as prose the UI had to parse to draw anything
    # other than a spinner. Counting it here means progress is a number.
    #
    # Null on existing rows rather than 0: those jobs finished before any of
    # this was recorded, and claiming they rendered zero scenes would be a
    # worse answer than admitting we do not know.
    op.add_column("generation_jobs", sa.Column("scenes_total", sa.Integer(), nullable=True))
    op.add_column("generation_jobs", sa.Column("scenes_completed", sa.Integer(), nullable=True))
    # error_message becomes the sentence shown to the creator, so the raw
    # provider or ffmpeg text needs somewhere else to live. It is still worth
    # keeping - it is the only thing that says which ffmpeg filter died.
    op.add_column("generation_jobs", sa.Column("error_detail", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("generation_jobs", "error_detail")
    op.drop_column("generation_jobs", "scenes_completed")
    op.drop_column("generation_jobs", "scenes_total")
