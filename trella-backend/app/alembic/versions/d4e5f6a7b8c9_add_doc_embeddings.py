"""add doc embeddings (pgvector) for semantic search

Revision ID: d4e5f6a7b8c9
Revises: 3c35a2cc74cf
Create Date: 2026-07-19 18:30:00.000000

"""
import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = '3c35a2cc74cf'
branch_labels = None
depends_on = None

# Immutable snapshot of the embedding vector width. MUST match
# settings.AI_EMBEDDING_DIM (enforced by startup validation against both the
# provider's real embedding size and this live DB column). Switching to an
# embedding model with a different dimension requires a NEW migration that
# alters the column -- never edit this frozen value.
EMBEDDING_DIM = 768


def upgrade():
    # pgvector extension (idempotent; the image ships it preinstalled).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        'doc_embeddings',
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('workspace_id', sa.Uuid(), nullable=False),
        sa.Column('doc_id', sa.Uuid(), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content_chunk', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(EMBEDDING_DIM), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['doc_id'], ['docs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_doc_embeddings_workspace_id', 'doc_embeddings', ['workspace_id']
    )
    op.create_index('ix_doc_embeddings_doc_id', 'doc_embeddings', ['doc_id'])
    # Approximate-NN index for cosine distance (matches the `<=>` operator used
    # by semantic_search_documents).
    op.execute(
        "CREATE INDEX ix_doc_embeddings_embedding_hnsw ON doc_embeddings "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade():
    op.drop_index('ix_doc_embeddings_embedding_hnsw', table_name='doc_embeddings')
    op.drop_index('ix_doc_embeddings_doc_id', table_name='doc_embeddings')
    op.drop_index('ix_doc_embeddings_workspace_id', table_name='doc_embeddings')
    op.drop_table('doc_embeddings')
    # ponytail: leave the `vector` extension installed on downgrade -- other
    # objects may come to depend on it; DROP EXTENSION could cascade unexpectedly.
