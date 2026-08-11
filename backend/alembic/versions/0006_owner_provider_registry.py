"""Add global owner registry and VTS provider consent links.

Revision ID: 0006_owner_provider_registry
Revises: 0005_vehicle_owner_tracking
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_owner_provider_registry"
down_revision: str | None = "0005_vehicle_owner_tracking"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

bigint_pk = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
owner_claim_status = sa.Enum(
    "PENDING_CLAIM",
    "CLAIMED",
    name="ownerclaimstatus",
    native_enum=False,
)
owner_provider_link_status = sa.Enum(
    "PENDING_OWNER_APPROVAL",
    "PENDING_PROVIDER_APPROVAL",
    "ACTIVE",
    "REJECTED",
    "ENDED",
    "SUSPENDED",
    name="ownerproviderlinkstatus",
    native_enum=False,
)
owner_provider_request_source = sa.Enum(
    "OWNER",
    "PROVIDER",
    name="ownerproviderrequestsource",
    native_enum=False,
)


def upgrade() -> None:
    with op.batch_alter_table("vehicle_owners") as batch:
        batch.add_column(
            sa.Column(
                "claim_status",
                owner_claim_status,
                nullable=False,
                server_default="CLAIMED",
            )
        )
        batch.add_column(sa.Column("created_by_provider_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_vehicle_owners_created_by_provider_id_vts_providers",
            "vts_providers",
            ["created_by_provider_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index(op.f("ix_vehicle_owners_claim_status"), ["claim_status"])
        batch.create_index(
            op.f("ix_vehicle_owners_created_by_provider_id"),
            ["created_by_provider_id"],
        )

    op.create_table(
        "vts_provider_owner_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("status", owner_provider_link_status, nullable=False),
        sa.Column("requested_by", owner_provider_request_source, nullable=False),
        sa.Column("requested_by_user_id", bigint_pk, nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responded_by_user_id", bigint_pk, nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_by_user_id", bigint_pk, nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["vts_providers.id"],
            ondelete="CASCADE",
            name=op.f("fk_vts_provider_owner_links_provider_id_vts_providers"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["vehicle_owners.id"],
            ondelete="CASCADE",
            name=op.f("fk_vts_provider_owner_links_owner_id_vehicle_owners"),
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_vts_provider_owner_links_requested_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["responded_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name=op.f("fk_vts_provider_owner_links_responded_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["ended_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name=op.f("fk_vts_provider_owner_links_ended_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vts_provider_owner_links")),
        sa.UniqueConstraint(
            "provider_id",
            "owner_id",
            name="uq_vts_provider_owner_link",
        ),
    )
    for column in (
        "provider_id",
        "owner_id",
        "status",
        "requested_by",
        "requested_by_user_id",
    ):
        op.create_index(
            op.f(f"ix_vts_provider_owner_links_{column}"),
            "vts_provider_owner_links",
            [column],
        )


def downgrade() -> None:
    for column in (
        "requested_by_user_id",
        "requested_by",
        "status",
        "owner_id",
        "provider_id",
    ):
        op.drop_index(
            op.f(f"ix_vts_provider_owner_links_{column}"),
            table_name="vts_provider_owner_links",
        )
    op.drop_table("vts_provider_owner_links")

    with op.batch_alter_table("vehicle_owners") as batch:
        batch.drop_index(op.f("ix_vehicle_owners_created_by_provider_id"))
        batch.drop_index(op.f("ix_vehicle_owners_claim_status"))
        batch.drop_constraint(
            "fk_vehicle_owners_created_by_provider_id_vts_providers",
            type_="foreignkey",
        )
        batch.drop_column("created_by_provider_id")
        batch.drop_column("claim_status")
