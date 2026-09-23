"""add knowledge collections table

Revision ID: b2c3d4e5f6a1
Revises: 021c3d9ff75d
Create Date: 2026-07-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a1'
down_revision = '021c3d9ff75d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'knowledge_collections',
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('workspace_id', sa.Uuid(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('icon', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('color', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('knowledge_collections')
