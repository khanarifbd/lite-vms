"""Add vehicle-scoped owner consent for VTS providers.

Revision ID: 0014_owner_provider_scope
Revises: 0013_owner_profile_cleanup
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_owner_provider_scope"
down_revision: str | None = "0013_owner_profile_cleanup"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.add_column(
        "vts_provider_owner_links",
        sa.Column(
            "vehicle_scope_mode",
            sa.String(length=20),
            nullable=False,
            server_default="all",
        ),
    )
    op.create_index(
        "ix_vts_provider_owner_links_vehicle_scope_mode",
        "vts_provider_owner_links",
        ["vehicle_scope_mode"],
        unique=False,
    )

    op.create_table(
        "vts_provider_owner_vehicle_access",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "link_id",
            sa.Uuid(),
            sa.ForeignKey("vts_provider_owner_links.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vehicle_id",
            sa.Uuid(),
            sa.ForeignKey("vehicles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "granted_by_user_id",
            BIGINT_PK,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "revoked_by_user_id",
            BIGINT_PK,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_vts_provider_owner_vehicle_access_link_id",
        "vts_provider_owner_vehicle_access",
        ["link_id"],
        unique=False,
    )
    op.create_index(
        "ix_vts_provider_owner_vehicle_access_vehicle_id",
        "vts_provider_owner_vehicle_access",
        ["vehicle_id"],
        unique=False,
    )
    op.create_index(
        "ix_vts_provider_owner_vehicle_access_granted_by_user_id",
        "vts_provider_owner_vehicle_access",
        ["granted_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_vts_provider_owner_vehicle_access_is_active",
        "vts_provider_owner_vehicle_access",
        ["is_active"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_vts_provider_owner_vehicle_access_is_active",
        table_name="vts_provider_owner_vehicle_access",
    )
    op.drop_index(
        "ix_vts_provider_owner_vehicle_access_granted_by_user_id",
        table_name="vts_provider_owner_vehicle_access",
    )
    op.drop_index(
        "ix_vts_provider_owner_vehicle_access_vehicle_id",
        table_name="vts_provider_owner_vehicle_access",
    )
    op.drop_index(
        "ix_vts_provider_owner_vehicle_access_link_id",
        table_name="vts_provider_owner_vehicle_access",
    )
    op.drop_table("vts_provider_owner_vehicle_access")
    op.drop_index(
        "ix_vts_provider_owner_links_vehicle_scope_mode",
        table_name="vts_provider_owner_links",
    )
    op.drop_column("vts_provider_owner_links", "vehicle_scope_mode")
