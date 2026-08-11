import re
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    DeviceCertificationStatus,
    DeviceOperationalStatus,
    DeviceOwnershipType,
    TelemetrySourceStatus,
    TrackingAssignmentStatus,
    TrackingReviewDecision,
    UserRole,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.tracking.model import TrackingDevice, VehicleDeviceAssignment
from app.modules.tracking.provider_device_schema import (
    ProviderDeviceAssignmentCreate,
    ProviderDeviceConfirmation,
    ProviderDeviceIdentityAvailability,
    ProviderDeviceTestPayload,
    ProviderVehicleTrackingWorkspace,
)
from app.modules.tracking.schema import TrackingDeviceRead, VehicleDeviceAssignmentRead
from app.modules.tracking.service import (
    build_assignment_read,
    end_active_vehicle_assignments,
    get_or_create_provider_source,
)
from app.modules.vehicles.provider_registration_router import (
    PROVIDER_VEHICLE_MANAGE_ROLES,
    PROVIDER_VEHICLE_READ_ROLES,
    get_provider_vehicle,
)

router = APIRouter(
    prefix="/vehicles/provider-registration",
    tags=["VTS Provider GPS Device Assignment"],
)

CURRENT_ASSIGNMENT_STATUSES = {
    TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
    TrackingAssignmentStatus.TESTING,
    TrackingAssignmentStatus.ACTIVE,
}
ASSIGNABLE_VEHICLE_STATUSES = {
    VehicleVerificationStatus.PENDING_VERIFICATION,
    VehicleVerificationStatus.UNDER_REVIEW,
    VehicleVerificationStatus.VERIFIED,
    VehicleVerificationStatus.CHANGES_REQUESTED,
}
PROVIDER_DEVICE_TEST_ROLES = (
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VTS_TECHNICAL,
)


def normalize_device_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if len(normalized) < 3:
        raise HTTPException(status_code=422, detail="Device identifier is too short")
    return normalized


def normalize_imei(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    normalized = re.sub(r"[\s-]", "", value)
    if not normalized.isdigit() or len(normalized) != 15:
        raise HTTPException(status_code=422, detail="IMEI must contain exactly 15 digits")
    return normalized


def device_read(device: TrackingDevice) -> TrackingDeviceRead:
    return TrackingDeviceRead(
        id=device.id,
        source_id=device.source_id,
        device_identifier=device.device_identifier,
        imei=device.imei,
        manufacturer=device.manufacturer,
        model=device.model,
        protocol=device.protocol,
        firmware_version=device.firmware_version,
        sim_number=device.sim_number,
        data_frequency_seconds=device.data_frequency_seconds,
        ownership_type=device.ownership_type,
        owner_id=device.owner_id,
        provider_id=device.provider_id,
        certification_status=device.certification_status,
        operational_status=device.operational_status,
        last_tested_at=device.last_tested_at,
        last_seen_at=device.last_seen_at,
    )


async def get_provider_assignment(
    session: AsyncSession,
    *,
    actor: User,
    vehicle_id: uuid.UUID,
    assignment_id: uuid.UUID,
) -> tuple[VehicleDeviceAssignment, object, object]:
    vehicle, provider = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    assignment = await session.get(VehicleDeviceAssignment, assignment_id)
    if (
        assignment is None
        or assignment.vehicle_id != vehicle.id
        or assignment.provider_id != provider.id
    ):
        raise HTTPException(status_code=404, detail="Provider GPS assignment not found")
    return assignment, vehicle, provider


@router.get(
    "/{vehicle_id}/tracking",
    response_model=ProviderVehicleTrackingWorkspace,
)
async def get_provider_vehicle_tracking_workspace(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderVehicleTrackingWorkspace:
    _, provider = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    assignments = list(
        await session.scalars(
            select(VehicleDeviceAssignment)
            .where(
                VehicleDeviceAssignment.vehicle_id == vehicle_id,
                VehicleDeviceAssignment.provider_id == provider.id,
            )
            .order_by(VehicleDeviceAssignment.valid_from.desc())
        )
    )
    assignment_reads = [await build_assignment_read(session, item) for item in assignments]
    current = next(
        (item for item in assignment_reads if item.status in CURRENT_ASSIGNMENT_STATUSES),
        None,
    )

    occupied_device_ids = select(VehicleDeviceAssignment.device_id).where(
        VehicleDeviceAssignment.status.in_(CURRENT_ASSIGNMENT_STATUSES)
    )
    available_devices = list(
        await session.scalars(
            select(TrackingDevice)
            .where(
                TrackingDevice.provider_id == provider.id,
                TrackingDevice.ownership_type == DeviceOwnershipType.PROVIDER_OWNED,
                TrackingDevice.id.not_in(occupied_device_ids),
                TrackingDevice.operational_status != DeviceOperationalStatus.RETIRED,
            )
            .order_by(TrackingDevice.device_identifier)
        )
    )
    return ProviderVehicleTrackingWorkspace(
        current_assignment=current,
        assignments=assignment_reads,
        available_devices=[device_read(item) for item in available_devices],
        active_count=sum(item.status == TrackingAssignmentStatus.ACTIVE for item in assignment_reads),
        history_count=sum(item.status in {TrackingAssignmentStatus.ENDED, TrackingAssignmentStatus.REJECTED} for item in assignment_reads),
    )


@router.get(
    "/{vehicle_id}/tracking/identity-check",
    response_model=ProviderDeviceIdentityAvailability,
)
async def check_provider_device_identity(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    device_identifier: Annotated[str | None, Query(max_length=160)] = None,
    imei: Annotated[str | None, Query(max_length=32)] = None,
    exclude_device_id: uuid.UUID | None = None,
) -> ProviderDeviceIdentityAvailability:
    _, provider = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    source = await get_or_create_provider_source(session, provider)
    identifier = normalize_device_identifier(device_identifier)
    normalized_imei = normalize_imei(imei)
    if not identifier and not normalized_imei:
        raise HTTPException(status_code=422, detail="Provide a device identifier or IMEI")

    identifier_query = select(TrackingDevice.id).where(
        TrackingDevice.source_id == source.id,
        TrackingDevice.device_identifier == identifier,
    )
    imei_query = select(TrackingDevice.id).where(TrackingDevice.imei == normalized_imei)
    if exclude_device_id is not None:
        existing = await session.get(TrackingDevice, exclude_device_id)
        if existing is None or existing.provider_id != provider.id:
            raise HTTPException(status_code=404, detail="Provider GPS device not found")
        identifier_query = identifier_query.where(TrackingDevice.id != exclude_device_id)
        imei_query = imei_query.where(TrackingDevice.id != exclude_device_id)

    identifier_exists = bool(identifier and await session.scalar(identifier_query))
    imei_exists = bool(normalized_imei and await session.scalar(imei_query))
    return ProviderDeviceIdentityAvailability(
        available=not identifier_exists and not imei_exists,
        device_identifier_available=not identifier_exists,
        imei_available=not imei_exists,
    )


@router.post(
    "/{vehicle_id}/tracking/assign",
    response_model=VehicleDeviceAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def assign_provider_gps_device(
    vehicle_id: uuid.UUID,
    payload: ProviderDeviceAssignmentCreate,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    vehicle, provider = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    if vehicle.verification_status not in ASSIGNABLE_VEHICLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="Submit the vehicle registration before assigning a GPS device",
        )

    in_progress = await session.scalar(
        select(VehicleDeviceAssignment.id).where(
            VehicleDeviceAssignment.vehicle_id == vehicle.id,
            VehicleDeviceAssignment.provider_id == provider.id,
            VehicleDeviceAssignment.status.in_(
                {
                    TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
                    TrackingAssignmentStatus.TESTING,
                }
            ),
        )
    )
    if in_progress is not None:
        raise HTTPException(
            status_code=409,
            detail="Complete or reject the current pending GPS assignment first",
        )

    source = await get_or_create_provider_source(session, provider)
    if payload.existing_device_id is not None:
        device = await session.get(TrackingDevice, payload.existing_device_id)
        if (
            device is None
            or device.provider_id != provider.id
            or device.source_id != source.id
            or device.ownership_type != DeviceOwnershipType.PROVIDER_OWNED
        ):
            raise HTTPException(status_code=404, detail="Available provider GPS device not found")
    else:
        identifier = normalize_device_identifier(payload.device_identifier)
        normalized_imei = normalize_imei(payload.imei)
        existing_identifier = await session.scalar(
            select(TrackingDevice.id).where(
                TrackingDevice.source_id == source.id,
                TrackingDevice.device_identifier == identifier,
            )
        )
        if existing_identifier is not None:
            raise HTTPException(
                status_code=409,
                detail="This device identifier already exists; select the existing device",
            )
        if normalized_imei and await session.scalar(
            select(TrackingDevice.id).where(TrackingDevice.imei == normalized_imei)
        ):
            raise HTTPException(status_code=409, detail="This IMEI is already registered")
        device = TrackingDevice(
            source_id=source.id,
            device_identifier=identifier,
            imei=normalized_imei,
            manufacturer=payload.manufacturer,
            model=payload.model,
            protocol=payload.protocol,
            firmware_version=payload.firmware_version,
            sim_number=payload.sim_number,
            data_frequency_seconds=payload.data_frequency_seconds,
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
            VehicleDeviceAssignment.status.in_(CURRENT_ASSIGNMENT_STATUSES),
        )
    )
    if occupied is not None:
        raise HTTPException(status_code=409, detail="This GPS device is already assigned")

    active_assignment = await session.scalar(
        select(VehicleDeviceAssignment.id).where(
            VehicleDeviceAssignment.vehicle_id == vehicle.id,
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
        )
    )
    assignment = VehicleDeviceAssignment(
        vehicle_id=vehicle.id,
        device_id=device.id,
        source_id=source.id,
        provider_id=provider.id,
        owner_id=vehicle.owner_id,
        account_reference=payload.account_reference,
        valid_from=datetime.now(UTC),
        status=TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
        is_primary=active_assignment is None,
        submitted_by_user_id=actor.id,
    )
    session.add(assignment)
    try:
        await session.flush()
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=provider.root_organization_id,
            action="tracking.provider_device_assigned",
            resource_type="vehicle_device_assignment",
            resource_public_id=assignment.id,
            new_values={
                "vehicle_id": str(vehicle.id),
                "device_id": str(device.id),
                "device_identifier": device.device_identifier,
                "replacement": active_assignment is not None,
            },
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="GPS device assignment already exists") from exc
    await session.refresh(assignment)
    return await build_assignment_read(session, assignment)


@router.post(
    "/{vehicle_id}/tracking/{assignment_id}/confirm",
    response_model=VehicleDeviceAssignmentRead,
)
async def confirm_provider_gps_assignment(
    vehicle_id: uuid.UUID,
    assignment_id: uuid.UUID,
    payload: ProviderDeviceConfirmation,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    assignment, _, provider = await get_provider_assignment(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
        assignment_id=assignment_id,
    )
    if assignment.status != TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION:
        raise HTTPException(status_code=409, detail="GPS assignment is not awaiting confirmation")
    device = await session.get(TrackingDevice, assignment.device_id)
    if device is None:
        raise HTTPException(status_code=409, detail="GPS device is missing")

    now = datetime.now(UTC)
    assignment.provider_confirmed_by_user_id = actor.id
    assignment.provider_confirmed_at = now
    if payload.decision == TrackingReviewDecision.APPROVE:
        assignment.status = TrackingAssignmentStatus.TESTING
        assignment.rejection_reason = None
        device.certification_status = DeviceCertificationStatus.TESTING
        device.operational_status = DeviceOperationalStatus.PENDING
    else:
        assignment.status = TrackingAssignmentStatus.REJECTED
        assignment.valid_to = now
        assignment.is_primary = False
        assignment.rejection_reason = payload.notes

    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=provider.root_organization_id,
        action=(
            "tracking.provider_device_confirmed"
            if payload.decision == TrackingReviewDecision.APPROVE
            else "tracking.provider_device_rejected"
        ),
        resource_type="vehicle_device_assignment",
        resource_public_id=assignment.id,
        new_values={"status": assignment.status.value, "notes": payload.notes},
    )
    await session.commit()
    await session.refresh(assignment)
    return await build_assignment_read(session, assignment)


@router.post(
    "/{vehicle_id}/tracking/{assignment_id}/test",
    response_model=VehicleDeviceAssignmentRead,
)
async def test_provider_gps_assignment(
    vehicle_id: uuid.UUID,
    assignment_id: uuid.UUID,
    payload: ProviderDeviceTestPayload,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_DEVICE_TEST_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    assignment, _, provider = await get_provider_assignment(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
        assignment_id=assignment_id,
    )
    if assignment.status != TrackingAssignmentStatus.TESTING:
        raise HTTPException(status_code=409, detail="GPS assignment is not in testing status")
    device = await session.get(TrackingDevice, assignment.device_id)
    if device is None:
        raise HTTPException(status_code=409, detail="GPS device is missing")

    device.last_tested_at = datetime.now(UTC)
    device.last_test_recorded_at = payload.recorded_at
    device.last_test_latitude = payload.latitude
    device.last_test_longitude = payload.longitude
    device.last_test_payload = payload.model_dump(mode="json")
    device.certification_status = DeviceCertificationStatus.TESTING
    source = await get_or_create_provider_source(session, provider)
    source.status = TelemetrySourceStatus.TESTING
    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=provider.root_organization_id,
        action="tracking.provider_device_test_recorded",
        resource_type="vehicle_device_assignment",
        resource_public_id=assignment.id,
        new_values={
            "recorded_at": payload.recorded_at.isoformat(),
            "latitude": payload.latitude,
            "longitude": payload.longitude,
        },
    )
    await session.commit()
    await session.refresh(assignment)
    return await build_assignment_read(session, assignment)


@router.post(
    "/{vehicle_id}/tracking/{assignment_id}/activate",
    response_model=VehicleDeviceAssignmentRead,
)
async def activate_provider_gps_assignment(
    vehicle_id: uuid.UUID,
    assignment_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    assignment, vehicle, provider = await get_provider_assignment(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
        assignment_id=assignment_id,
    )
    if assignment.status != TrackingAssignmentStatus.TESTING:
        raise HTTPException(status_code=409, detail="GPS assignment is not ready for activation")
    if vehicle.verification_status != VehicleVerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=409,
            detail="Bangladesh Police must verify the vehicle before GPS activation",
        )
    device = await session.get(TrackingDevice, assignment.device_id)
    if device is None or device.last_tested_at is None:
        raise HTTPException(status_code=409, detail="A successful GPS test is required")

    previous_assignments = list(
        await session.scalars(
            select(VehicleDeviceAssignment).where(
                VehicleDeviceAssignment.vehicle_id == vehicle.id,
                VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
                VehicleDeviceAssignment.id != assignment.id,
            )
        )
    )
    await end_active_vehicle_assignments(
        session,
        vehicle_id=vehicle.id,
        except_assignment_id=assignment.id,
    )
    for previous in previous_assignments:
        previous_device = await session.get(TrackingDevice, previous.device_id)
        if previous_device is not None:
            previous_device.operational_status = DeviceOperationalStatus.RETIRED

    now = datetime.now(UTC)
    assignment.status = TrackingAssignmentStatus.ACTIVE
    assignment.is_primary = True
    assignment.approved_by_user_id = actor.id
    assignment.approved_at = now
    assignment.rejection_reason = None
    device.certification_status = DeviceCertificationStatus.APPROVED
    device.operational_status = DeviceOperationalStatus.ACTIVE
    source = await get_or_create_provider_source(session, provider)
    source.status = TelemetrySourceStatus.ACTIVE
    source.approved_at = source.approved_at or now

    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=provider.root_organization_id,
        action="tracking.provider_device_activated",
        resource_type="vehicle_device_assignment",
        resource_public_id=assignment.id,
        new_values={
            "status": TrackingAssignmentStatus.ACTIVE.value,
            "replaced_assignment_ids": [str(item.id) for item in previous_assignments],
        },
    )
    await session.commit()
    await session.refresh(assignment)
    return await build_assignment_read(session, assignment)
