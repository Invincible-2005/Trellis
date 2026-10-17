"""task submission file details

Revision ID: b7e3d5a9c142
Revises: a9c4e2f7b815
Create Date: 2026-10-17 20:00:00.000000

Ticket 12 D59: a hand-in shows its file name and size (an UploadThing link ends
in a key, not the name). The index serves "this task's hand-ins, newest first".
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b7e3d5a9c142'
down_revision: Union[str, Sequence[str], None] = 'a9c4e2f7b815'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # The default only fills rows that may already exist; new rows always send a name.
    op.add_column(
        'task_submissions',
        sa.Column('file_name', sa.String(length=255), nullable=False, server_default=''),
    )
    op.alter_column('task_submissions', 'file_name', server_default=None)
    op.add_column('task_submissions', sa.Column('file_size', sa.Integer(), nullable=True))
    op.create_index(
        'idx_task_submissions_task_submitted',
        'task_submissions',
        ['task_id', sa.text('submitted_at DESC')],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_task_submissions_task_submitted', table_name='task_submissions')
    op.drop_column('task_submissions', 'file_size')
    op.drop_column('task_submissions', 'file_name')
