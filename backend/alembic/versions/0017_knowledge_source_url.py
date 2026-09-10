"""remember which page a knowledge document came from, and what it said

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Null on everything filed by hand, which is the honest answer: those
    # documents did not come from a page.
    op.add_column("knowledge_documents", sa.Column("source_url", sa.String(), nullable=True))
    op.add_column("knowledge_documents", sa.Column("summary", sa.Text(), nullable=True))
    op.create_index(
        "ix_knowledge_documents_source_url", "knowledge_documents", ["source_url"]
    )


def downgrade() -> None:
    op.drop_index("ix_knowledge_documents_source_url", table_name="knowledge_documents")
    op.drop_column("knowledge_documents", "summary")
    op.drop_column("knowledge_documents", "source_url")
