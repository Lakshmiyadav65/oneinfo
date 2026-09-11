"""remember the words the transcriber reliably gets wrong

Revision ID: 0022
Revises: 0021
Create Date: 2026-09-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transcript_corrections",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "creator_id",
            sa.String(),
            sa.ForeignKey("creators.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("heard", sa.String(), nullable=False),
        sa.Column("corrected", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        # One rule per misheard word per creator. `heard` is stored
        # lower-cased, so two rows differing only in capitalisation cannot
        # both exist and fight over the same text.
        sa.UniqueConstraint("creator_id", "heard", name="uq_correction_creator_heard"),
    )
    op.create_index(
        "ix_transcript_corrections_creator_id", "transcript_corrections", ["creator_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_transcript_corrections_creator_id", table_name="transcript_corrections"
    )
    op.drop_table("transcript_corrections")
