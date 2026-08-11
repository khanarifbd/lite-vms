"""Enforce one primary VTS provider per user.

Revision ID: 0008_provider_primary_owner
Revises: 0007_owner_mobile_password_reset
Create Date: 2026-07-26
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008_provider_primary_owner"
down_revision: str | None = "0007_owner_mobile_password_reset"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("vts_providers") as batch:
        batch.create_unique_constraint(
            "uq_vts_providers_primary_admin_user_id",
            ["primary_admin_user_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("vts_providers") as batch:
        batch.drop_constraint(
            "uq_vts_providers_primary_admin_user_id",
            type_="unique",
        )
