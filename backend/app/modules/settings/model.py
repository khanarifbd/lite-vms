from sqlalchemy import CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, BigIntPrimaryKeyMixin, TimestampMixin


class SystemConfiguration(BigIntPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "system_configurations"
    __table_args__ = (
        CheckConstraint(
            "live_map_refresh_seconds >= 15 AND live_map_refresh_seconds <= 3600",
            name="live_map_refresh_seconds_range",
        ),
    )

    scope: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        default="global",
        server_default="global",
    )
    live_map_refresh_seconds: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=30,
        server_default="30",
    )
