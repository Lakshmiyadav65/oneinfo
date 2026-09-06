"""projects.language: tanglish -> tenglish

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-06

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The project language option was labelled "Telugu in Latin script" but
    # stored as "tanglish" — which in this codebase already means
    # Tamil-English (see LocalizedLanguage). The localization step read that
    # value and produced Tamil for Telugu creators. "tenglish" is the term
    # the rest of the app already uses for Telugu-English, so the rows move
    # to it; nobody ever chose this option meaning Tamil.
    op.execute("UPDATE projects SET language = 'tenglish' WHERE language = 'tanglish'")


def downgrade() -> None:
    op.execute("UPDATE projects SET language = 'tanglish' WHERE language = 'tenglish'")
