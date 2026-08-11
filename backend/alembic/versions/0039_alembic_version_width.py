"""Expand Alembic revision storage before long revision identifiers.

Revision ID: 0039_version_width
Revises: 0038_vehicle_certificates
"""

import sqlalchemy as sa
from alembic import op

revision = "0039_version_width"
down_revision = "0038_vehicle_certificates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alembic creates this table with VARCHAR(32), while the following existing
    # certificate/VTS migration has a longer revision identifier. PostgreSQL
    # enforces the limit and otherwise rolls back after applying its DDL.
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("alembic_version") as batch_op:
            batch_op.alter_column(
                "version_num",
                existing_type=sa.String(length=32),
                type_=sa.String(length=64),
                existing_nullable=False,
            )
    else:
        op.alter_column(
            "alembic_version",
            "version_num",
            existing_type=sa.String(length=32),
            type_=sa.String(length=64),
            existing_nullable=False,
        )


def downgrade() -> None:
    # Do not shrink the version column: a revision identifier longer than 32
    # characters may already be recorded.
    pass
