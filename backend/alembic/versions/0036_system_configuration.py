"""Persist global system configuration values.

Revision ID: 0036_system_configuration
Revises: 0035_driver_application_lock
"""

from datetime import datetime

import sqlalchemy as sa
from alembic import op

revision = "0036_system_configuration"
down_revision = "0035_driver_application_lock"
branch_labels = None
depends_on = None


BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "system_configurations",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column(
            "scope",
            sa.String(length=32),
            nullable=False,
            server_default="global",
        ),
        sa.Column(
            "live_map_refresh_seconds",
            sa.Integer(),
            nullable=False,
            server_default="30",
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "live_map_refresh_seconds >= 15 AND live_map_refresh_seconds <= 3600",
            name="ck_system_configurations_live_map_refresh_seconds_range",
        ),
        sa.UniqueConstraint("scope", name="uq_system_configurations_scope"),
    )

    now = datetime.now()
    system_configurations = sa.table(
        "system_configurations",
        sa.column("scope", sa.String(length=32)),
        sa.column("live_map_refresh_seconds", sa.Integer()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    op.bulk_insert(
        system_configurations,
        [
            {
                "scope": "global",
                "live_map_refresh_seconds": 30,
                "created_at": now,
                "updated_at": now,
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("system_configurations")
