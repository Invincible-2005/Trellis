"""chat list + audit indexes, audit_log.injection_suspected

Revision ID: e2a7c4d9b613
Revises: b5d1f3c8e902
Create Date: 2026-10-12 14:00:00.000000

Chat effort, slice A. The chat list (a user's chats in one org, most recently
used first, ticket 08) and the audit log (an org's chat turns by time) get
their indexes; audit_log gets the injection flag from ticket 12 D21 (flagged,
never blocked). LangGraph's own checkpoint tables are created by
AsyncPostgresSaver.setup() at startup, not here.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e2a7c4d9b613'
down_revision: Union[str, Sequence[str], None] = 'b5d1f3c8e902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'audit_log',
        sa.Column('injection_suspected', sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_index(
        'idx_chat_sessions_user_org', 'chat_sessions',
        ['user_id', 'org_id', sa.text('last_active_at DESC')],
    )
    op.create_index('idx_audit_log_org_created', 'audit_log', ['org_id', 'created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_audit_log_org_created', table_name='audit_log')
    op.drop_index('idx_chat_sessions_user_org', table_name='chat_sessions')
    op.drop_column('audit_log', 'injection_suspected')
