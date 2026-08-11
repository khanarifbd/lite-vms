"""reset legacy enforcement test data

Revision ID: 0023_reset_enforcement_data
Revises: 0022_enforcement_case_flow
Create Date: 2026-07-30

This migration intentionally removes all existing enforcement test/configuration
records so the new Policy -> Geofence -> Rule -> Review -> Case workflow can be
configured from a clean state. Core users, organizations, vehicles, telemetry and
GPS history are not touched.
"""

from alembic import op


revision = "0023_reset_enforcement_data"
down_revision = "0022_enforcement_case_flow"
branch_labels = None
depends_on = None


_ENFORCEMENT_AUDIT_RESOURCE_TYPES = (
    "enforcement_policy",
    "enforcement_geofence",
    "enforcement_rule",
    "speed_rule",
    "enforcement_jurisdiction",
    "vehicle_enforcement_exemption",
    "violation_candidate",
    "enforcement_case",
)


def upgrade() -> None:
    # Delete in foreign-key-safe order.
    op.execute("DELETE FROM enforcement_cases")
    op.execute("DELETE FROM violation_candidates")
    op.execute("DELETE FROM speed_rules")
    op.execute("DELETE FROM vehicle_enforcement_exemptions")
    op.execute("DELETE FROM enforcement_jurisdictions")
    op.execute("DELETE FROM enforcement_geofences")
    op.execute("DELETE FROM enforcement_policies")

    resource_types = ", ".join(f"'{value}'" for value in _ENFORCEMENT_AUDIT_RESOURCE_TYPES)
    op.execute(f"DELETE FROM audit_logs WHERE resource_type IN ({resource_types})")


def downgrade() -> None:
    # Destructive test-data reset is intentionally irreversible.
    pass
