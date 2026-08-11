import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    DeviceCertificationStatus,
    DeviceOperationalStatus,
    DeviceOwnershipType,
    ProviderStatus,
    TrackingAssignmentStatus,
    UserRole,
)
from app.modules.assignments.duty_service import open_duty_session
from app.modules.assignments.model import DriverAssignment
from app.modules.auth.model import User
from app.modules.drivers.enums import (
    DriverAssignmentStatus,
    DriverLicenceStatus,
    DriverVerificationStatus,
)
from app.modules.drivers.model import Driver, DriverLicence
from app.modules.drivers.service import (
    owner_has_active_driver_link,
    provider_has_active_driver_link,
)
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import has_active_provider_owner_link
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user
from app.modules.tracking.model import (
    TrackingDevice,
    VehicleDeviceAssignment,
)
from app.modules.tracking.service import get_or_create_provider_source
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.schema import VehicleDriverSetup, VehicleTrackingSetup


def _is_platform_admin(actor: User) -> bool:
    roles = set(getattr(actor, "_role_codes", set()))
    return bool(
        roles.intersection({UserRole.SUPER_ADMIN.value, UserRole.POLICE_ADMIN.value})
    )


async def create_initial_tracking_assignment(
    session: AsyncSession,
    *,
    actor: User,
    vehicle: Vehicle,
    owner: VehicleOwner,
    setup: VehicleTrackingSetup | None,
) -> VehicleDeviceAssignment | None:
    if setup is None:
        return None

    actor_provider = await get_provider_for_user(session, actor.id)
    provider_id = setup.provider_id or (actor_provider.id if actor_provider else None)
    if provider_id is None:
        raise HTTPException(
            status_code=422,
            detail="tracking_setup.provider_id is required for vehicle owners and administrators",
        )

    provider = await session.get(VTSProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Selected VTS provider is not approved")
    if actor_provider is not None and actor_provider.id != provider.id:
        raise HTTPException(
            status_code=403,
            detail="A VTS provider can assign only its own tracking service",
        )
    if not _is_platform_admin(actor) and not await has_active_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
    ):
        raise HTTPException(
            status_code=403,
            detail="The vehicle owner must have an active link with the selected VTS provider",
        )

    source = await get_or_create_provider_source(session, provider)
    if setup.device_id is not None:
        device = await session.get(TrackingDevice, setup.device_id)
        if device is None:
            raise HTTPException(status_code=404, detail="Tracking device not found")
        if device.provider_id != provider.id or device.source_id != source.id:
            raise HTTPException(
                status_code=403,
                detail="The selected device does not belong to this VTS provider",
            )
    else:
        duplicate_conditions = [
            TrackingDevice.device_identifier == setup.device_identifier,
        ]
        if setup.imei:
            duplicate_conditions.append(TrackingDevice.imei == setup.imei)
        device = await session.scalar(
            select(TrackingDevice).where(or_(*duplicate_conditions))
        )
        if device is not None and device.provider_id != provider.id:
            raise HTTPException(
                status_code=409,
                detail="This device identity belongs to another VTS provider",
            )
        if device is None:
            device = TrackingDevice(
                source_id=source.id,
                device_identifier=setup.device_identifier or "",
                imei=setup.imei,
                manufacturer=setup.manufacturer,
                model=setup.model,
                protocol=setup.protocol,
                firmware_version=setup.firmware_version,
                sim_number=setup.sim_number,
                data_frequency_seconds=setup.data_frequency_seconds,
                ownership_type=DeviceOwnershipType.PROVIDER_OWNED,
                provider_id=provider.id,
                certification_status=DeviceCertificationStatus.PENDING,
                operational_status=DeviceOperationalStatus.PENDING,
            )
            session.add(device)
            await session.flush()

    occupied = await session.scalar(
        select(VehicleDeviceAssignment.id).where(
            VehicleDeviceAssignment.device_id == device.id,
            VehicleDeviceAssignment.status.in_(
                [
                    TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
                    TrackingAssignmentStatus.TESTING,
                    TrackingAssignmentStatus.ACTIVE,
                ]
            ),
        )
    )
    if occupied is not None:
        raise HTTPException(
            status_code=409,
            detail="This GPS device is already assigned or awaiting confirmation",
        )

    assignment = VehicleDeviceAssignment(
        vehicle_id=vehicle.id,
        device_id=device.id,
        source_id=source.id,
        provider_id=provider.id,
        owner_id=owner.id,
        account_reference=setup.account_reference,
        valid_from=datetime.now(UTC),
        status=TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
        is_primary=True,
        submitted_by_user_id=actor.id,
    )
    session.add(assignment)
    await session.flush()
    return assignment


async def create_initial_driver_assignment(
    session: AsyncSession,
    *,
    actor: User,
    vehicle: Vehicle,
    owner: VehicleOwner,
    setup: VehicleDriverSetup | None,
) -> DriverAssignment | None:
    if setup is None:
        return None

    driver = await session.get(Driver, setup.driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    if driver.verification_status != DriverVerificationStatus.VERIFIED:
        raise HTTPException(status_code=409, detail="Driver must be verified")

    licence = await session.scalar(
        select(DriverLicence).where(DriverLicence.driver_id == driver.id)
    )
    if licence is None or licence.verification_status != DriverLicenceStatus.VERIFIED:
        raise HTTPException(status_code=409, detail="Driver licence must be verified")
    if licence.expiry_date < date.today():
        raise HTTPException(status_code=409, detail="Driver licence has expired")

    actor_provider = await get_provider_for_user(session, actor.id)
    provider_id: uuid.UUID | None = None
    if not _is_platform_admin(actor):
        if not await owner_has_active_driver_link(
            session,
            owner_id=owner.id,
            driver_id=driver.id,
        ):
            raise HTTPException(status_code=403, detail="Active owner-driver link is required")
        if actor_provider is not None:
            provider_id = actor_provider.id
            if not await has_active_provider_owner_link(
                session,
                provider_id=provider_id,
                owner_id=owner.id,
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Provider must have an active link with the vehicle owner",
                )
            if not await provider_has_active_driver_link(
                session,
                provider_id=provider_id,
                driver_id=driver.id,
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Active provider-driver link is required",
                )

    existing_driver_assignment = await session.scalar(
        select(DriverAssignment).where(
            DriverAssignment.driver_id == driver.id,
            DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
        )
    )
    if existing_driver_assignment is not None:
        raise HTTPException(
            status_code=409,
            detail="Driver already has an active vehicle assignment",
        )

    current_vehicle_assignment = await session.scalar(
        select(DriverAssignment).where(
            DriverAssignment.vehicle_id == vehicle.id,
            DriverAssignment.status.in_(
                [DriverAssignmentStatus.PENDING, DriverAssignmentStatus.ACTIVE]
            ),
        )
    )
    if current_vehicle_assignment is not None:
        raise HTTPException(
            status_code=409,
            detail="Vehicle already has a current or pending driver assignment",
        )

    assignment = DriverAssignment(
        vehicle_id=vehicle.id,
        driver_id=driver.id,
        owner_id=owner.id,
        provider_id=provider_id,
        assigned_by_user_id=actor.id,
        valid_from=setup.valid_from or datetime.now(UTC),
        status=DriverAssignmentStatus.PENDING,
        is_on_duty=False,
        notes=setup.notes,
    )
    session.add(assignment)
    await session.flush()
    return assignment


async def activate_pending_driver_assignment(
    session: AsyncSession,
    *,
    vehicle: Vehicle,
) -> DriverAssignment | None:
    assignment = await session.scalar(
        select(DriverAssignment)
        .where(
            DriverAssignment.vehicle_id == vehicle.id,
            DriverAssignment.status == DriverAssignmentStatus.PENDING,
        )
        .order_by(DriverAssignment.valid_from.desc())
    )
    if assignment is None:
        return None

    reason: str | None = None
    driver = await session.get(Driver, assignment.driver_id)
    licence = (
        await session.scalar(
            select(DriverLicence).where(DriverLicence.driver_id == assignment.driver_id)
        )
        if driver is not None
        else None
    )
    if driver is None or driver.verification_status != DriverVerificationStatus.VERIFIED:
        reason = "Driver is no longer verified"
    elif licence is None or licence.verification_status != DriverLicenceStatus.VERIFIED:
        reason = "Driver licence is no longer verified"
    elif licence.expiry_date < date.today():
        reason = "Driver licence has expired"
    elif not await owner_has_active_driver_link(
        session,
        owner_id=assignment.owner_id,
        driver_id=assignment.driver_id,
    ):
        reason = "Owner-driver link is no longer active"
    elif assignment.provider_id is not None and not await has_active_provider_owner_link(
        session,
        provider_id=assignment.provider_id,
        owner_id=assignment.owner_id,
    ):
        reason = "Owner-provider link is no longer active"
    elif assignment.provider_id is not None and not await provider_has_active_driver_link(
        session,
        provider_id=assignment.provider_id,
        driver_id=assignment.driver_id,
    ):
        reason = "Provider-driver link is no longer active"

    conflicting = await session.scalar(
        select(DriverAssignment).where(
            DriverAssignment.driver_id == assignment.driver_id,
            DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
            DriverAssignment.vehicle_id != vehicle.id,
        )
    )
    if reason is None and conflicting is not None:
        reason = "Driver already has another active vehicle assignment"

    if reason is not None:
        assignment.status = DriverAssignmentStatus.REJECTED
        assignment.valid_to = datetime.now(UTC)
        assignment.notes = f"{assignment.notes + ' | ' if assignment.notes else ''}{reason}"
        return assignment

    current_on_duty = await session.scalar(
        select(DriverAssignment).where(
            DriverAssignment.vehicle_id == vehicle.id,
            DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
            DriverAssignment.is_on_duty.is_(True),
            DriverAssignment.id != assignment.id,
        )
    )
    assignment.status = DriverAssignmentStatus.ACTIVE
    assignment.is_on_duty = current_on_duty is None
    if assignment.is_on_duty:
        await session.flush()
        open_duty_session(
            session,
            assignment=assignment,
            started_at=datetime.now(UTC),
            started_by_user_id=assignment.assigned_by_user_id,
            reason=assignment.notes or "Vehicle approval activated initial driver duty",
            source="vehicle_approval",
        )
    return assignment


async def reject_pending_vehicle_setups(
    session: AsyncSession,
    *,
    vehicle: Vehicle,
    reason: str,
) -> None:
    now = datetime.now(UTC)
    pending_driver = await session.scalar(
        select(DriverAssignment).where(
            DriverAssignment.vehicle_id == vehicle.id,
            DriverAssignment.status == DriverAssignmentStatus.PENDING,
        )
    )
    if pending_driver is not None:
        pending_driver.status = DriverAssignmentStatus.REJECTED
        pending_driver.valid_to = now
        pending_driver.notes = (
            f"{pending_driver.notes + ' | ' if pending_driver.notes else ''}{reason}"
        )

    pending_tracking = await session.scalar(
        select(VehicleDeviceAssignment).where(
            VehicleDeviceAssignment.vehicle_id == vehicle.id,
            VehicleDeviceAssignment.status.in_(
                [
                    TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
                    TrackingAssignmentStatus.TESTING,
                ]
            ),
        )
    )
    if pending_tracking is not None:
        pending_tracking.status = TrackingAssignmentStatus.REJECTED
        pending_tracking.valid_to = now
        pending_tracking.is_primary = False
        pending_tracking.rejection_reason = reason
