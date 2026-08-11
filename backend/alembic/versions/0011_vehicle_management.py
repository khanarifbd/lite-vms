"""Expand vehicle management fields and identity constraints.

Revision ID: 0011_vehicle_management
Revises: 0010_global_driver_registry
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_vehicle_management"
down_revision: str | None = "0010_global_driver_registry"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.add_column(sa.Column("registration_number_display", sa.String(80), nullable=True))
        batch_op.add_column(sa.Column("vehicle_category", sa.String(80), nullable=True))
        batch_op.add_column(sa.Column("seating_capacity", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("load_capacity_kg", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("fitness_expiry_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("tax_token_expiry_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("insurance_expiry_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("route_permit_number", sa.String(120), nullable=True))
        batch_op.add_column(sa.Column("route_permit_area", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("route_permit_expiry_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("created_by_provider_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_vehicles_created_by_provider_id_vts_providers",
            "vts_providers",
            ["created_by_provider_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_index("ix_vehicles_chassis_number", "vehicles", ["chassis_number"])
    op.create_index(
        "uq_vehicles_engine_number_not_null",
        "vehicles",
        ["engine_number"],
        unique=True,
        postgresql_where=sa.text("engine_number IS NOT NULL"),
        sqlite_where=sa.text("engine_number IS NOT NULL"),
    )
    op.create_index("ix_vehicles_vehicle_category", "vehicles", ["vehicle_category"])
    op.create_index("ix_vehicles_fitness_expiry_date", "vehicles", ["fitness_expiry_date"])
    op.create_index("ix_vehicles_tax_token_expiry_date", "vehicles", ["tax_token_expiry_date"])
    op.create_index("ix_vehicles_insurance_expiry_date", "vehicles", ["insurance_expiry_date"])
    op.create_index(
        "ix_vehicles_route_permit_expiry_date",
        "vehicles",
        ["route_permit_expiry_date"],
    )
    op.create_index(
        "ix_vehicles_created_by_provider_id",
        "vehicles",
        ["created_by_provider_id"],
    )

    op.execute(
        "UPDATE vehicles SET registration_number_display = registration_number "
        "WHERE registration_number_display IS NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_vehicles_created_by_provider_id", table_name="vehicles")
    op.drop_index("ix_vehicles_route_permit_expiry_date", table_name="vehicles")
    op.drop_index("ix_vehicles_insurance_expiry_date", table_name="vehicles")
    op.drop_index("ix_vehicles_tax_token_expiry_date", table_name="vehicles")
    op.drop_index("ix_vehicles_fitness_expiry_date", table_name="vehicles")
    op.drop_index("ix_vehicles_vehicle_category", table_name="vehicles")
    op.drop_index("uq_vehicles_engine_number_not_null", table_name="vehicles")
    op.drop_index("ix_vehicles_chassis_number", table_name="vehicles")

    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.drop_constraint(
            "fk_vehicles_created_by_provider_id_vts_providers",
            type_="foreignkey",
        )
        batch_op.drop_column("created_by_provider_id")
        batch_op.drop_column("notes")
        batch_op.drop_column("route_permit_expiry_date")
        batch_op.drop_column("route_permit_area")
        batch_op.drop_column("route_permit_number")
        batch_op.drop_column("insurance_expiry_date")
        batch_op.drop_column("tax_token_expiry_date")
        batch_op.drop_column("fitness_expiry_date")
        batch_op.drop_column("load_capacity_kg")
        batch_op.drop_column("seating_capacity")
        batch_op.drop_column("vehicle_category")
        batch_op.drop_column("registration_number_display")
