"""org-level invitations (team optional, one pending invite per email per org)

Revision ID: b5d1f3c8e902
Revises: a7c2e9f4b310
Create Date: 2026-10-09 23:30:00.000000

Member-management effort, slice A (ticket 12 D25/D26). Invites from Admin →
Members go into the org with an optional org-level role, so `team_id` and
`role_id` become optional.
The old "one invite per (email, org, team)" rule is replaced by "one pending
invite per (org, email)", enforced by making the pending index unique.
Emails are stored lowercase by the code that writes them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5d1f3c8e902'
down_revision: Union[str, Sequence[str], None] = 'a7c2e9f4b310'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('invitations', 'team_id', existing_type=sa.Uuid(), nullable=True)
    op.alter_column('invitations', 'role_id', existing_type=sa.Uuid(), nullable=True)
    op.drop_constraint('invitations_email_org_id_team_id_key', 'invitations', type_='unique')

    op.drop_index('idx_invitations_pending', table_name='invitations')
    op.create_index(
        'idx_invitations_pending', 'invitations', ['org_id', 'email'],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    """Downgrade schema. Fails if any invitation has no team or role (delete those rows first)."""
    op.drop_index('idx_invitations_pending', table_name='invitations')
    op.create_index(
        'idx_invitations_pending', 'invitations', ['org_id', 'email'],
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.create_unique_constraint(
        'invitations_email_org_id_team_id_key', 'invitations', ['email', 'org_id', 'team_id']
    )
    op.alter_column('invitations', 'role_id', existing_type=sa.Uuid(), nullable=False)
    op.alter_column('invitations', 'team_id', existing_type=sa.Uuid(), nullable=False)
