"""Index enforcement vehicle picker search fields.

Revision ID: 0024_vehicle_picker_search
Revises: 0023_reset_enforcement_data
"""

from alembic import op

revision = "0024_vehicle_picker_search"
down_revision = "0023_reset_enforcement_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.execute("CREATE INDEX IF NOT EXISTS ix_vehicle_reg_lower_pattern ON vehicles (lower(registration_number) text_pattern_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vehicle_chassis_lower_pattern ON vehicles (lower(chassis_number) text_pattern_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vehicle_engine_lower_pattern ON vehicles (lower(engine_number) text_pattern_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tracking_device_imei_lower_pattern ON tracking_devices (lower(imei) text_pattern_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tracking_device_identifier_lower_pattern ON tracking_devices (lower(device_identifier) text_pattern_ops)")

    op.execute("CREATE INDEX IF NOT EXISTS ix_vehicle_reg_display_trgm ON vehicles USING gin (lower(registration_number_display) gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vehicle_brand_trgm ON vehicles USING gin (lower(brand) gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vehicle_model_trgm ON vehicles USING gin (lower(model) gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vehicle_owner_name_trgm ON vehicle_owners USING gin (lower(name) gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vts_provider_name_trgm ON vts_providers USING gin (lower(name) gin_trgm_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_vts_provider_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_vehicle_owner_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_vehicle_model_trgm")
    op.execute("DROP INDEX IF EXISTS ix_vehicle_brand_trgm")
    op.execute("DROP INDEX IF EXISTS ix_vehicle_reg_display_trgm")
    op.execute("DROP INDEX IF EXISTS ix_tracking_device_identifier_lower_pattern")
    op.execute("DROP INDEX IF EXISTS ix_tracking_device_imei_lower_pattern")
    op.execute("DROP INDEX IF EXISTS ix_vehicle_engine_lower_pattern")
    op.execute("DROP INDEX IF EXISTS ix_vehicle_chassis_lower_pattern")
    op.execute("DROP INDEX IF EXISTS ix_vehicle_reg_lower_pattern")
