"""Enforce one active primary user identifier.

Revision ID: 0009_user_identifier_management
Revises: 0008_provider_primary_owner
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_user_identifier_management"
down_revision: str | None = "0008_provider_primary_owner"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "uq_user_identifiers_one_active_primary",
        "user_identifiers",
        ["user_id"],
        unique=True,
        sqlite_where=sa.text("is_primary = 1 AND disabled_at IS NULL"),
        postgresql_where=sa.text("is_primary = true AND disabled_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_user_identifiers_one_active_primary",
        table_name="user_identifiers",
    )
