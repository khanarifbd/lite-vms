import uuid
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.main  # noqa: F401
from app.db.base import Base
from app.modules.assignments.model import DriverAssignment
from app.modules.drivers.enums import DriverAssignmentStatus


def assignment(
    *,
    vehicle_id: uuid.UUID,
    driver_id: uuid.UUID,
    owner_id: uuid.UUID,
    on_duty: bool,
) -> DriverAssignment:
    return DriverAssignment(
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        owner_id=owner_id,
        provider_id=None,
        assigned_by_user_id=1,
        status=DriverAssignmentStatus.ACTIVE,
        is_on_duty=on_duty,
        notes="Long-haul roster coverage",
    )


@pytest.mark.asyncio
async def test_vehicle_roster_allows_multiple_active_drivers_but_one_on_duty(
    tmp_path: Path,
) -> None:
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'driver-duty-roster.db'}"
    )
    session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    vehicle_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    first_driver_id = uuid.uuid4()
    second_driver_id = uuid.uuid4()

    async with session_factory() as session:
        session.add(
            assignment(
                vehicle_id=vehicle_id,
                driver_id=first_driver_id,
                owner_id=owner_id,
                on_duty=True,
            )
        )
        session.add(
            assignment(
                vehicle_id=vehicle_id,
                driver_id=second_driver_id,
                owner_id=owner_id,
                on_duty=False,
            )
        )
        await session.commit()

        session.add(
            assignment(
                vehicle_id=vehicle_id,
                driver_id=uuid.uuid4(),
                owner_id=owner_id,
                on_duty=True,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

        session.add(
            assignment(
                vehicle_id=uuid.uuid4(),
                driver_id=first_driver_id,
                owner_id=owner_id,
                on_duty=False,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

    await engine.dispose()
