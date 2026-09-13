"""let a creator choose the voice their videos are spoken in

Revision ID: 0026
Revises: 0025
Create Date: 2026-09-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The speaker was a single environment variable, set once to a male
    # voice, shared by every creator on the deployment and changeable only
    # by editing a file on the server. A creator who wanted a different
    # voice had no way to say so - and no way to hear one before choosing.
    #
    # Null means "whatever the deployment is configured with", which is what
    # every existing creator has been using.
    op.add_column("creators", sa.Column("speech_speaker", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("creators", "speech_speaker")
