"""document search indexes (pgvector HNSW + scope filters)

Revision ID: a7c2e9f4b310
Revises: d4e8b2a61f07
Create Date: 2026-10-09 23:00:00.000000

Documents effort, slice A (indexes from ticket 02). Indexes only: no table or
column changes.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a7c2e9f4b310'
down_revision: Union[str, Sequence[str], None] = 'd4e8b2a61f07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # pgvector must already be on (document_chunks.embedding exists); this is a no-op then.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Nearest-neighbour search for search_chunks (cosine distance, `<=>`)
    op.create_index(
        'idx_chunks_embedding_hnsw', 'document_chunks', ['embedding'],
        postgresql_using='hnsw',
        postgresql_ops={'embedding': 'vector_cosine_ops'},
    )
    # Scope filters applied inside the vector search (org / role / team docs)
    op.create_index('idx_chunks_org_scope', 'document_chunks', ['org_id', 'scope_type'])
    op.create_index('idx_chunks_org_scope_role', 'document_chunks', ['org_id', 'scope_type', 'role_id'])
    op.create_index('idx_chunks_org_scope_team', 'document_chunks', ['org_id', 'scope_type', 'team_id'])
    # Document list page: an org's documents, newest first
    op.create_index('idx_documents_org_created', 'documents', ['org_id', 'created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_documents_org_created', table_name='documents')
    op.drop_index('idx_chunks_org_scope_team', table_name='document_chunks')
    op.drop_index('idx_chunks_org_scope_role', table_name='document_chunks')
    op.drop_index('idx_chunks_org_scope', table_name='document_chunks')
    op.drop_index('idx_chunks_embedding_hnsw', table_name='document_chunks')
