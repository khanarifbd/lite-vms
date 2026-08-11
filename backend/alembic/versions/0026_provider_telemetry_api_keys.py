"""Add provider telemetry API key storage.

Revision ID: 0026_provider_api_keys
Revises: 0025_telemetry_enforcement
"""

from alembic import op
import sqlalchemy as sa

revision = "0026_provider_api_keys"
down_revision = "0025_telemetry_enforcement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("telemetry_sources") as batch_op:
        batch_op.add_column(sa.Column("api_key_prefix", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("api_key_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("api_key_last_four", sa.String(length=4), nullable=True))
        batch_op.add_column(sa.Column("api_key_created_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("api_key_rotated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("api_key_revoked_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("api_key_created_by_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("last_authenticated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key(
            "fk_telemetry_sources_api_key_created_by_id_users",
            "users",
            ["api_key_created_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index(
        "ix_telemetry_sources_api_key_prefix",
        "telemetry_sources",
        ["api_key_prefix"],
        unique=True,
    )
    op.create_index(
        "ix_telemetry_sources_api_key_revoked_at",
        "telemetry_sources",
        ["api_key_revoked_at"],
        unique=False,
    )
    op.create_index(
        "ix_telemetry_sources_last_authenticated_at",
        "telemetry_sources",
        ["last_authenticated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_telemetry_sources_last_authenticated_at", table_name="telemetry_sources")
    op.drop_index("ix_telemetry_sources_api_key_revoked_at", table_name="telemetry_sources")
    op.drop_index("ix_telemetry_sources_api_key_prefix", table_name="telemetry_sources")
    op.drop_constraint(
        "fk_telemetry_sources_api_key_created_by_id_users",
        "telemetry_sources",
        type_="foreignkey",
    )
    op.drop_column("telemetry_sources", "last_authenticated_at")
    op.drop_column("telemetry_sources", "api_key_created_by_id")
    op.drop_column("telemetry_sources", "api_key_revoked_at")
    op.drop_column("telemetry_sources", "api_key_rotated_at")
    op.drop_column("telemetry_sources", "api_key_created_at")
    op.drop_column("telemetry_sources", "api_key_last_four")
    op.drop_column("telemetry_sources", "api_key_hash")
    op.drop_column("telemetry_sources", "api_key_prefix")
