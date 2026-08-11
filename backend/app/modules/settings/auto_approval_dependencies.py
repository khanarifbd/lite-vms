from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import OwnerVerificationStatus, VehicleVerificationStatus
from app.core.database import get_session
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.model import User
from app.modules.drivers.enums import DriverVerificationStatus
from app.modules.drivers.service import get_driver_for_user
from app.modules.owners.service import get_owner_for_user
from app.modules.settings.service import (
    auto_approve_driver,
    auto_approve_owner,
    auto_approve_vehicle,
)
from app.modules.vehicles.model import Vehicle


async def apply_owner_auto_approval_after_request(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[None]:
    yield
    owner = await get_owner_for_user(session, actor.id)
    if owner is None or owner.verification_status not in {
        OwnerVerificationStatus.PENDING,
        OwnerVerificationStatus.UNDER_REVIEW,
        OwnerVerificationStatus.CHANGES_REQUESTED,
    }:
        return
    if await auto_approve_owner(session, owner):
        await session.commit()


async def apply_vehicle_auto_approval_after_request(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[None]:
    yield
    vehicles = list(
        await session.scalars(
            select(Vehicle).where(
                Vehicle.submitted_by_user_id == actor.id,
                Vehicle.verification_status.in_(
                    [
                        VehicleVerificationStatus.PENDING_VERIFICATION,
                        VehicleVerificationStatus.UNDER_REVIEW,
                    ]
                ),
            )
        )
    )
    changed = False
    for vehicle in vehicles:
        changed = (await auto_approve_vehicle(session, vehicle)) or changed
    if changed:
        await session.commit()


async def apply_driver_auto_approval_after_request(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[None]:
    yield
    driver = await get_driver_for_user(session, actor.id)
    if driver is None or driver.verification_status not in {
        DriverVerificationStatus.PENDING,
        DriverVerificationStatus.UNDER_REVIEW,
        DriverVerificationStatus.CHANGES_REQUESTED,
    }:
        return
    if await auto_approve_driver(session, driver):
        await session.commit()
