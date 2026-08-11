import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utc_now


class VehicleQRToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vehicle_qr_tokens"

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
