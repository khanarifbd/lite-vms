"""Add provider vehicle certificate issuance fields.

Revision ID: 0038_vehicle_certificates
Revises: 0037_document_replacement_fix
"""

import sqlalchemy as sa
from alembic import op

revision = "0038_vehicle_certificates"
down_revision = "0037_document_replacement_fix"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.add_column(sa.Column("certificate_number", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("certificate_issued_at", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("certificate_expires_at", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("certificate_generated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("certificate_generated_by_user_id", sa.BigInteger(), nullable=True))
        batch_op.create_unique_constraint("uq_vehicles_certificate_number", ["certificate_number"])
        batch_op.create_index("ix_vehicles_certificate_issued_at", ["certificate_issued_at"])
        batch_op.create_index("ix_vehicles_certificate_expires_at", ["certificate_expires_at"])
        batch_op.create_foreign_key(
            "fk_vehicles_certificate_generated_by_user_id_users",
            "users",
            ["certificate_generated_by_user_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.drop_constraint("fk_vehicles_certificate_generated_by_user_id_users", type_="foreignkey")
        batch_op.drop_index("ix_vehicles_certificate_expires_at")
        batch_op.drop_index("ix_vehicles_certificate_issued_at")
        batch_op.drop_constraint("uq_vehicles_certificate_number", type_="unique")
        batch_op.drop_column("certificate_generated_by_user_id")
        batch_op.drop_column("certificate_generated_at")
        batch_op.drop_column("certificate_expires_at")
        batch_op.drop_column("certificate_issued_at")
        batch_op.drop_column("certificate_number")
