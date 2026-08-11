import secrets
import time
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import BigInteger, Integer, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

BIGINT_PK = BigInteger().with_variant(Integer, "sqlite")
BANGLADESH_TZ = ZoneInfo("Asia/Dhaka")


def utc_now() -> datetime:
    """Return Bangladesh local time as a naive datetime for existing DB columns."""
    return datetime.now(BANGLADESH_TZ).replace(tzinfo=None)


def uuid7() -> uuid.UUID:
    """Generate a time-ordered UUIDv7 compatible identifier on Python 3.13."""
    timestamp_ms = int(time.time() * 1000) & ((1 << 48) - 1)
    random_a = secrets.randbits(12)
    random_b = secrets.randbits(62)
    value = (timestamp_ms << 80) | (0x7 << 76) | (random_a << 64) | (0b10 << 62) | random_b
    return uuid.UUID(int=value)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


class BigIntPrimaryKeyMixin:
    id: Mapped[int] = mapped_column(BIGINT_PK, primary_key=True, autoincrement=True)


class PublicIDMixin:
    public_id: Mapped[uuid.UUID] = mapped_column(
        unique=True,
        index=True,
        default=uuid7,
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
