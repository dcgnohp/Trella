"""Merge multiple heads

Revision ID: 85a22c1a9b94
Revises: a1b2c3d4e5f6
Create Date: 2026-07-12 00:20:40.299284

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '85a22c1a9b94'
down_revision = ('a1b2c3d4e5f6', 'b2c3d4e5f6a1')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
