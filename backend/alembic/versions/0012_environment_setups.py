"""saved filming setups, reusable across projects

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A setup the creator named and kept, so a look they worked out once is
    # picked from a list on the next project instead of rebuilt from the
    # advanced controls. Stored as the same structured values a scene holds,
    # not as prose: applying one has to be an exact copy.
    op.create_table(
        "environment_setups",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "creator_id",
            sa.String(),
            sa.ForeignKey("creators.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("environment", sa.JSON(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_environment_setups_creator_id", "environment_setups", ["creator_id"]
    )
    # One creator cannot have two setups by the same name - the picker shows
    # names alone, so duplicates would be indistinguishable at the point of
    # choosing.
    op.create_unique_constraint(
        "uq_environment_setups_creator_name", "environment_setups", ["creator_id", "name"]
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_environment_setups_creator_name", "environment_setups", type_="unique"
    )
    op.drop_index("ix_environment_setups_creator_id", table_name="environment_setups")
    op.drop_table("environment_setups")
