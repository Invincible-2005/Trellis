"""org-level role, protected system role, clerk invitation id, identity indexes

Revision ID: d4e8b2a61f07
Revises: c3f1a9d27e54
Create Date: 2026-10-08 22:00:00.000000

Ticket 13 §2 (decisions 12-D9, 12-D10; indexes from ticket 02).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e8b2a61f07'
down_revision: Union[str, Sequence[str], None] = 'c3f1a9d27e54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Org-level role (D9). Default ON DELETE (restrict): a role still held can't be deleted.
    op.add_column('org_members', sa.Column('role_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_org_members_role_id_roles', 'org_members', 'roles', ['role_id'], ['id']
    )

    # Protected root Admin role (D9)
    op.add_column(
        'roles',
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Link to the Clerk invitation for revocation (D10)
    op.add_column('invitations', sa.Column('clerk_invitation_id', sa.String(), nullable=True))
    op.create_unique_constraint(
        'invitations_clerk_invitation_id_key', 'invitations', ['clerk_invitation_id']
    )

    # Indexes (ticket 02)
    op.create_index('idx_org_members_role', 'org_members', ['org_id', 'role_id'])
    op.create_index(
        'idx_invitations_pending', 'invitations', ['org_id', 'email'],
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index('idx_team_members_user', 'team_members', ['user_id'])
    op.create_index('idx_roles_org_parent', 'roles', ['org_id', 'parent_role_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_roles_org_parent', table_name='roles')
    op.drop_index('idx_team_members_user', table_name='team_members')
    op.drop_index('idx_invitations_pending', table_name='invitations')
    op.drop_index('idx_org_members_role', table_name='org_members')

    op.drop_constraint('invitations_clerk_invitation_id_key', 'invitations', type_='unique')
    op.drop_column('invitations', 'clerk_invitation_id')

    op.drop_column('roles', 'is_system')

    op.drop_constraint('fk_org_members_role_id_roles', 'org_members', type_='foreignkey')
    op.drop_column('org_members', 'role_id')
