"""per-scene generation jobs

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Null on every existing row, which is correct: they all rendered the
    # whole video, since single-scene jobs did not exist until now.
    op.add_column(
        "generation_jobs", sa.Column("scene_id", sa.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_generation_jobs_scene_id",
        "generation_jobs",
        "storyboard_scenes",
        ["scene_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_generation_jobs_scene_id", "generation_jobs", type_="foreignkey")
    op.drop_column("generation_jobs", "scene_id")
