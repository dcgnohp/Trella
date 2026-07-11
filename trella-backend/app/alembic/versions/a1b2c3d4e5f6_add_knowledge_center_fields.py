"""add knowledge center fields

Revision ID: a1b2c3d4e5f6
Revises: 968572a1d68e
Create Date: 2026-07-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '968572a1d68e'
branch_labels = None
depends_on = 'b2c3d4e5f6a1'


def upgrade():
    # Add new columns to docs
    op.add_column('docs', sa.Column('source_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False, server_default='MANUAL'))
    op.add_column('docs', sa.Column('category', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True))
    op.add_column('docs', sa.Column('collection_id', sa.Uuid(), nullable=True))
    op.add_column('docs', sa.Column('sprint_id', sa.Uuid(), nullable=True))
    op.add_column('docs', sa.Column('epic_id', sa.Uuid(), nullable=True))
    op.add_column('docs', sa.Column('board_id', sa.Uuid(), nullable=True))
    op.add_column('docs', sa.Column('is_pinned_global', sa.Boolean(), nullable=False, server_default='false'))
    op.create_foreign_key(None, 'docs', 'knowledge_collections', ['collection_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key(None, 'docs', 'sprints', ['sprint_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key(None, 'docs', 'tasks', ['epic_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key(None, 'docs', 'boards', ['board_id'], ['id'], ondelete='SET NULL')

    # Create knowledge_user_prefs
    op.create_table(
        'knowledge_user_prefs',
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('workspace_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('doc_id', sa.Uuid(), nullable=False),
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_favorite', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('last_viewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['doc_id'], ['docs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('workspace_id', 'user_id', 'doc_id'),
    )


def downgrade():
    op.drop_table('knowledge_user_prefs')
    op.drop_constraint(None, 'docs', type_='foreignkey')
    op.drop_column('docs', 'is_pinned_global')
    op.drop_column('docs', 'board_id')
    op.drop_column('docs', 'epic_id')
    op.drop_column('docs', 'sprint_id')
    op.drop_column('docs', 'collection_id')
    op.drop_column('docs', 'category')
    op.drop_column('docs', 'source_type')
