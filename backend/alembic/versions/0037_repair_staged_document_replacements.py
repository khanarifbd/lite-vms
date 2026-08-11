"""Repair vehicle document replacements created by the legacy workflow.

Revision ID: 0037_document_replacement_fix
Revises: 0036_system_configuration
"""

import sqlalchemy as sa
from alembic import op

revision = "0037_document_replacement_fix"
down_revision = "0036_system_configuration"
branch_labels = None
depends_on = None


PENDING_STATUSES = ("PENDING_VERIFICATION", "pending_verification")
REVOKED_STATUSES = ("REVOKED", "revoked")


def upgrade() -> None:
    connection = op.get_bind()
    documents = sa.table(
        "vehicle_documents",
        sa.column("id", sa.Uuid(as_uuid=True)),
        sa.column("status", sa.String(length=30)),
        sa.column("version", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
        sa.column("replaced_by_id", sa.Uuid(as_uuid=True)),
    )

    pending_documents = list(
        connection.execute(
            sa.select(
                documents.c.id,
                documents.c.status,
                documents.c.version,
                documents.c.is_active,
            ).where(documents.c.status.in_(PENDING_STATUSES))
        ).mappings()
    )

    for pending in pending_documents:
        predecessor = connection.execute(
            sa.select(
                documents.c.id,
                documents.c.status,
                documents.c.version,
                documents.c.is_active,
            )
            .where(documents.c.replaced_by_id == pending["id"])
            .order_by(documents.c.version.desc())
            .limit(1)
        ).mappings().first()

        # An initial pending document has no predecessor and remains active so it is
        # visible as the current unverified record. A replacement stays staged until
        # Police approval while its previously approved predecessor remains active.
        if predecessor is None:
            continue
        if predecessor["status"] in PENDING_STATUSES + REVOKED_STATUSES:
            continue

        connection.execute(
            sa.update(documents)
            .where(documents.c.id == predecessor["id"])
            .values(is_active=True)
        )
        connection.execute(
            sa.update(documents)
            .where(documents.c.id == pending["id"])
            .values(is_active=False)
        )


def downgrade() -> None:
    # This migration repairs historical state. Reintroducing the unsafe state during
    # downgrade would deactivate valid documents, so the data correction is retained.
    pass
