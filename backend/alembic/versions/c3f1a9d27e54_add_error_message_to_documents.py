"""add error_message to documents

Revision ID: c3f1a9d27e54
Revises: 6e9bcbd37128
Create Date: 2026-10-08 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3f1a9d27e54'
down_revision: Union[str, Sequence[str], None] = '6e9bcbd37128'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Admin-facing failure reason written by the ingestion pipeline (Ticket 11)
    op.add_column('documents', sa.Column('error_message', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('documents', 'error_message')
