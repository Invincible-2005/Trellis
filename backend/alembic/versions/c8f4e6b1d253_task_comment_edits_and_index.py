"""task comment edits and index

Revision ID: c8f4e6b1d253
Revises: b7e3d5a9c142
Create Date: 2026-10-17 22:00:00.000000

Ticket 12 D60: an edited comment shows "(edited)", so comments keep when they
were last edited. The index (planned in ticket 02, never created) serves "this
task's comments, oldest first".
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c8f4e6b1d253'
down_revision: Union[str, Sequence[str], None] = 'b7e3d5a9c142'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('task_comments', sa.Column('edited_at', sa.DateTime(), nullable=True))
    op.create_index('idx_task_comments_task', 'task_comments', ['task_id', 'created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_task_comments_task', table_name='task_comments')
    op.drop_column('task_comments', 'edited_at')
