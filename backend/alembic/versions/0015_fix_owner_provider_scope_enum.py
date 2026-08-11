"""Normalize owner-provider vehicle scope enum values.

Revision ID: 0015_owner_provider_scope_enum
Revises: 0014_owner_provider_scope
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_owner_provider_scope_enum"
down_revision: str | None = "0014_owner_provider_scope"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SQLAlchemy's Enum persists enum member names by default (ALL/SELECTED),
    # while migration 0014 populated existing rows with lowercase values.
    op.execute(
        sa.text(
            """
            UPDATE vts_provider_owner_links
            SET vehicle_scope_mode = CASE
                WHEN vehicle_scope_mode = 'all' THEN 'ALL'
                WHEN vehicle_scope_mode = 'selected' THEN 'SELECTED'
                ELSE vehicle_scope_mode
            END
            WHERE vehicle_scope_mode IN ('all', 'selected')
            """
        )
    )

    with op.batch_alter_table("vts_provider_owner_links") as batch_op:
        batch_op.alter_column(
            "vehicle_scope_mode",
            existing_type=sa.String(length=20),
            existing_nullable=False,
            server_default="ALL",
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE vts_provider_owner_links
            SET vehicle_scope_mode = CASE
                WHEN vehicle_scope_mode = 'ALL' THEN 'all'
                WHEN vehicle_scope_mode = 'SELECTED' THEN 'selected'
                ELSE vehicle_scope_mode
            END
            WHERE vehicle_scope_mode IN ('ALL', 'SELECTED')
            """
        )
    )

    with op.batch_alter_table("vts_provider_owner_links") as batch_op:
        batch_op.alter_column(
            "vehicle_scope_mode",
            existing_type=sa.String(length=20),
            existing_nullable=False,
            server_default="all",
        )
