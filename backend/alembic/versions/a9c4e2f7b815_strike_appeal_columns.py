"""strike appeal columns

Revision ID: a9c4e2f7b815
Revises: f3b8d1e6a724
Create Date: 2026-10-13 14:00:00.000000

Ticket 12 D6: the receiver's appeal note and who reviewed it, when. New strikes
are saved as `confirmed` (Python-side default; the enum keeps
`pending_agent_review` for old rows, no longer written). The index serves the
3-strike count per person per team.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a9c4e2f7b815'
down_revision: Union[str, Sequence[str], None] = 'f3b8d1e6a724'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('strikes', sa.Column('appeal_notes', sa.Text(), nullable=True))
    op.add_column('strikes', sa.Column('reviewed_by_user_id', sa.Uuid(), nullable=True))
    op.add_column('strikes', sa.Column('reviewed_at', sa.DateTime(), nullable=True))
    op.create_foreign_key(
        'fk_strikes_reviewed_by_user', 'strikes', 'users', ['reviewed_by_user_id'], ['id']
    )
    op.create_index('idx_strikes_team_receiver', 'strikes', ['team_id', 'given_to_user_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_strikes_team_receiver', table_name='strikes')
    op.drop_constraint('fk_strikes_reviewed_by_user', 'strikes', type_='foreignkey')
    op.drop_column('strikes', 'reviewed_at')
    op.drop_column('strikes', 'reviewed_by_user_id')
    op.drop_column('strikes', 'appeal_notes')
