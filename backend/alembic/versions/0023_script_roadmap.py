"""keep the topics a script was researched from, not just the lines it produced

Revision ID: 0023
Revises: 0022
Create Date: 2026-09-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The script agent now works out the actual topics before it writes a
    # line, and the Value beat is spoken from them. Those topics are worth
    # more than the beat that quotes them: they are what the creator checks
    # for accuracy, what a second video on the same subject starts from, and
    # the only record of why the script says what it says.
    #
    # Null on every script written before this. The UI shows the roadmap when
    # there is one and the script alone when there is not.
    op.add_column("scripts", sa.Column("roadmap", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("scripts", "roadmap")
