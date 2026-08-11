"""Remove the duplicate legacy owner profile table.

Revision ID: 0013_owner_profile_cleanup
Revises: 0012_registry_foundation
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_owner_profile_cleanup"
down_revision: str | None = "0012_registry_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    # Preserve any legacy trade-licence value that was only stored in
    # owner_profiles before VehicleOwner became the authoritative profile.
    op.execute(
        sa.text(
            """
            UPDATE vehicle_owners
            SET trade_license_number = COALESCE(
                trade_license_number,
                (
                    SELECT owner_profiles.trade_license_reference
                    FROM owner_profiles
                    WHERE owner_profiles.user_id = vehicle_owners.primary_admin_user_id
                    LIMIT 1
                )
            )
            WHERE EXISTS (
                SELECT 1
                FROM owner_profiles
                WHERE owner_profiles.user_id = vehicle_owners.primary_admin_user_id
            )
            """
        )
    )
    op.drop_table("owner_profiles")


def downgrade() -> None:
    op.create_table(
        "owner_profiles",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            BIGINT_PK,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("owner_type", sa.String(40), nullable=False, server_default="individual"),
        sa.Column("owner_registry_reference", sa.String(120), nullable=True, unique=True),
        sa.Column("company_name", sa.String(180), nullable=True),
        sa.Column("trade_license_reference", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO owner_profiles (
                user_id,
                owner_type,
                owner_registry_reference,
                company_name,
                trade_license_reference,
                created_at,
                updated_at
            )
            SELECT
                primary_admin_user_id,
                owner_type,
                nid_or_registration,
                CASE WHEN owner_type = 'company' THEN name ELSE NULL END,
                trade_license_number,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            FROM vehicle_owners
            WHERE primary_admin_user_id IS NOT NULL
            """
        )
    )
