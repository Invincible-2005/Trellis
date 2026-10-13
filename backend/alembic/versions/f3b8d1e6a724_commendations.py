"""commendations table

Revision ID: f3b8d1e6a724
Revises: e2a7c4d9b613
Create Date: 2026-10-13 13:00:00.000000

Ticket 12 D5: praise from someone ranked above the person in that team. Mirrors
`strikes` without status, appeal or escalation. Indexes: a person's
commendations in an org, newest first (dashboard, later), and the team check
when a team is deleted (D31).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f3b8d1e6a724'
down_revision: Union[str, Sequence[str], None] = 'e2a7c4d9b613'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'commendations',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('org_id', sa.Uuid(), nullable=False),
        sa.Column('team_id', sa.Uuid(), nullable=False),
        sa.Column('given_by_user_id', sa.Uuid(), nullable=False),
        sa.Column('given_to_user_id', sa.Uuid(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id']),
        sa.ForeignKeyConstraint(['given_by_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['given_to_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_commendations_to_user', 'commendations', ['org_id', 'given_to_user_id', 'created_at']
    )
    op.create_index('idx_commendations_team', 'commendations', ['team_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_commendations_team', table_name='commendations')
    op.drop_index('idx_commendations_to_user', table_name='commendations')
    op.drop_table('commendations')
