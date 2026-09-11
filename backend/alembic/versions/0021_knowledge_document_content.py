"""keep what a knowledge document said, not only the pieces it was cut into

Revision ID: 0021
Revises: 0020
Create Date: 2026-09-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Until now the text survived ingestion only as overlapping chunks, and
    # chunking normalises whitespace - so reading a document back gave every
    # paragraph, line and speaker turn fused into one block. Fine for
    # retrieval, which is what chunks are for; useless for a creator opening
    # a transcript to check it.
    #
    # Null on everything filed before this, which stays readable: the reader
    # falls back to rejoining the chunks, exactly as it did.
    op.add_column("knowledge_documents", sa.Column("content", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("knowledge_documents", "content")
