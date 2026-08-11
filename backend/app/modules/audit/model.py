import uuid

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    BIGINT_PK,
    Base,
    BigIntPrimaryKeyMixin,
    PublicIDMixin,
    TimestampMixin,
)


class AuditLog(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "audit_logs"

    tenant_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_organization_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(120), index=True)
    resource_type: Mapped[str] = mapped_column(String(100), index=True)
    resource_public_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    previous_values: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
