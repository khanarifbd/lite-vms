import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    DeviceCertificationStatus,
    DeviceOperationalStatus,
    DeviceOwnershipType,
    OwnerVerificationStatus,
    ProviderStatus,
    TelemetrySourceStatus,
    TelemetrySourceType,
    TrackingAssignmentStatus,
    TrackingReviewDecision,
    UserRole,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import (
    has_active_provider_owner_link,
    provider_can_access_owner,
    user_can_access_owner,
)
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user
from app.modules.tracking.model import (
    TelemetrySource,
    TrackingDevice,
    VehicleDeviceAssignment,
)
from app.modules.tracking.schema import (
    DeviceTestTelemetry,
    OwnerManagedDeviceRegister,
    ProviderConnectionRequest,
    TrackingAssignmentPage,
    TrackingDecision,
    VehicleDeviceAssignmentRead,
)
from app.modules.tracking.service import (
    build_assignment_read,
    end_active_vehicle_assignments,
    get_or_create_owner_source,
    get_or_create_provider_source,
    user_has_tenant_access,
)
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/tracking", tags=["Vehicle GPS Tracking"])


def actor_roles(user: User) -> set[str]:
    return set(getattr(user, "_role_codes", set()))


def can_review_tracking(user: User) -> bool:
    return bool(
        actor_roles(user).intersection({UserRole.SUPER_ADMIN.value, UserRole.POLICE_ADMIN.value})
    )


async def get_verified_vehicle_owner(
    session: AsyncSession,
    *,
    vehicle_id: uuid.UUID,
) -> tuple[Vehicle, VehicleOwner]:
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise HTTPException(status_code=409, detail="Vehicle owner is missing")
    if owner.verification_status != OwnerVerificationStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Vehicle owner is not approved")
    if vehicle.verification_status != VehicleVerificationStatus.VERIFIED:
        raise HTTPException(status_code=403, detail="Vehicle must be verified first")
    return vehicle, owner


async def ensure_owner_device_access(
    session: AsyncSession,
    *,
    actor: User,
    owner: VehicleOwner,
) -> None:
    if can_review_tracking(actor):
        return
    if not await user_can_access_owner(session, user_id=actor.id, owner=owner):
        raise HTTPException(
            status_code=403,
            detail="Only the vehicle owner can register an owner-managed device",
        )


async def ensure_assignment_access(
    session: AsyncSession,
    *,
    actor: User,
    assignment: VehicleDeviceAssignment,
) -> None:
    if can_review_tracking(actor):
        return
    owner = await session.get(VehicleOwner, assignment.owner_id)
    if owner and await user_can_access_owner(session, user_id=actor.id, owner=owner):
        return
    if assignment.provider_id is not None:
        provider = await get_provider_for_user(session, actor.id)
        if (
            provider
            and provider.id == assignment.provider_id
            and await provider_can_access_owner(
                session,
                provider_id=provider.id,
                owner_id=assignment.owner_id,
            )
        ):
            return
    raise HTTPException(status_code=403, detail="You cannot access this tracking request")


@router.post(
    "/vehicles/{vehicle_id}/connect-provider",
    response_model=VehicleDeviceAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def request_vts_provider_connection(
    vehicle_id: uuid.UUID,
    payload: ProviderConnectionRequest,
    actor: Annotated[
        User,
        Depends(
            require_roles(
                UserRole.VEHICLE_OWNER,
                UserRole.VTS_ADMIN,
                UserRole.SUPER_ADMIN,
                UserRole.POLICE_ADMIN,
            )
        ),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    vehicle, owner = await get_verified_vehicle_owner(session, vehicle_id=vehicle_id)
    provider = await session.get(VTSProvider, payload.provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Selected VTS provider is not approved")
    if not await has_active_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
    ):
        raise HTTPException(
            status_code=403,
            detail="The vehicle owner must have an active link with this VTS provider",
        )

    if not can_review_tracking(actor):
        if UserRole.VEHICLE_OWNER.value in actor_roles(actor):
            if not await user_can_access_owner(
                session,
                user_id=actor.id,
                owner=owner,
            ):
                raise HTTPException(status_code=403, detail="You cannot manage this vehicle")
        else:
            actor_vts = await get_provider_for_user(session, actor.id)
            if actor_vts is None or actor_vts.id != provider.id:
                raise HTTPException(
                    status_code=403,
                    detail="A VTS provider can connect only its own linked customers",
                )

    source = await get_or_create_provider_source(session, provider)
    existing_device = await session.scalar(
        select(TrackingDevice).where(TrackingDevice.device_identifier == payload.device_identifier)
    )
    if existing_device is not None and existing_device.provider_id != provider.id:
        raise HTTPException(
            status_code=409,
            detail="This device identifier belongs to another telemetry source",
        )
    if existing_device is not None:
        occupied_assignment = await session.scalar(
            select(VehicleDeviceAssignment.id).where(
                VehicleDeviceAssignment.device_id == existing_device.id,
                VehicleDeviceAssignment.status.in_(
                    [
                        TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
                        TrackingAssignmentStatus.TESTING,
                        TrackingAssignmentStatus.ACTIVE,
                    ]
                ),
            )
        )
        if occupied_assignment is not None:
            raise HTTPException(
                status_code=409,
                detail="This GPS device is already assigned or awaiting confirmation",
            )
    device = existing_device or TrackingDevice(
        source_id=source.id,
        device_identifier=payload.device_identifier,
        imei=payload.imei,
        manufacturer=payload.manufacturer,
        model=payload.model,
        ownership_type=DeviceOwnershipType.PROVIDER_OWNED,
        provider_id=provider.id,
        certification_status=DeviceCertificationStatus.PENDING,
        operational_status=DeviceOperationalStatus.PENDING,
    )
    if existing_device is None:
        session.add(device)
        await session.flush()

    assignment = VehicleDeviceAssignment(
        vehicle_id=vehicle.id,
        device_id=device.id,
        source_id=source.id,
        provider_id=provider.id,
        owner_id=owner.id,
        account_reference=payload.account_reference,
        valid_from=datetime.now(UTC),
        status=TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
        is_primary=True,
        submitted_by_user_id=actor.id,
    )
    session.add(assignment)
    try:
        await session.flush()
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action="tracking.provider_connection_requested",
            resource_type="vehicle_device_assignment",
            resource_public_id=assignment.id,
            new_values={
                "vehicle_id": str(vehicle.id),
                "provider_id": str(provider.id),
                "device_identifier": device.device_identifier,
            },
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Tracking request already exists") from exc
    await session.refresh(assignment)
    return await build_assignment_read(session, assignment)


@router.post(
    "/vehicles/{vehicle_id}/register-owner-device",
    response_model=VehicleDeviceAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_owner_managed_device(
    vehicle_id: uuid.UUID,
    payload: OwnerManagedDeviceRegister,
    actor: Annotated[
        User,
        Depends(
            require_roles(
                UserRole.VEHICLE_OWNER,
                UserRole.SUPER_ADMIN,
                UserRole.POLICE_ADMIN,
            )
        ),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    vehicle, owner = await get_verified_vehicle_owner(session, vehicle_id=vehicle_id)
    await ensure_owner_device_access(session, actor=actor, owner=owner)
    duplicate_conditions = [TrackingDevice.device_identifier == payload.device_identifier]
    if payload.imei:
        duplicate_conditions.append(TrackingDevice.imei == payload.imei)
    duplicate = await session.scalar(select(TrackingDevice).where(or_(*duplicate_conditions)))
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="GPS device is already registered")

    source = await get_or_create_owner_source(session, owner)
    device = TrackingDevice(
        source_id=source.id,
        device_identifier=payload.device_identifier,
        imei=payload.imei,
        manufacturer=payload.manufacturer,
        model=payload.model,
        protocol=payload.protocol,
        firmware_version=payload.firmware_version,
        sim_number=payload.sim_number,
        data_frequency_seconds=payload.data_frequency_seconds,
        ownership_type=DeviceOwnershipType.OWNER_OWNED,
        owner_id=owner.id,
        certification_status=DeviceCertificationStatus.TESTING,
        operational_status=DeviceOperationalStatus.PENDING,
    )
    session.add(device)
    await session.flush()
    assignment = VehicleDeviceAssignment(
        vehicle_id=vehicle.id,
        device_id=device.id,
        source_id=source.id,
        owner_id=owner.id,
        valid_from=datetime.now(UTC),
        status=TrackingAssignmentStatus.TESTING,
        is_primary=True,
        submitted_by_user_id=actor.id,
    )
    session.add(assignment)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="GPS device is already registered") from exc
    await session.refresh(assignment)
    return await build_assignment_read(session, assignment)


@router.post(
    "/assignments/{assignment_id}/test-telemetry",
    response_model=VehicleDeviceAssignmentRead,
)
async def submit_owner_device_test(
    assignment_id: uuid.UUID,
    payload: DeviceTestTelemetry,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    assignment = await session.get(VehicleDeviceAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Tracking assignment not found")
    await ensure_assignment_access(session, actor=actor, assignment=assignment)
    source = await session.get(TelemetrySource, assignment.source_id)
    device = await session.get(TrackingDevice, assignment.device_id)
    if source is None or device is None:
        raise HTTPException(status_code=409, detail="Tracking source or device is missing")
    if source.source_type != TelemetrySourceType.OWNER_MANAGED:
        raise HTTPException(
            status_code=400,
            detail="Only owner-managed devices require this test",
        )
    if assignment.status != TrackingAssignmentStatus.TESTING:
        raise HTTPException(status_code=409, detail="This device is not awaiting a test")

    device.last_tested_at = datetime.now(UTC)
    device.last_test_recorded_at = payload.recorded_at
    device.last_test_latitude = payload.latitude
    device.last_test_longitude = payload.longitude
    device.last_test_payload = payload.model_dump(mode="json")
    device.certification_status = DeviceCertificationStatus.TESTING
    source.status = TelemetrySourceStatus.TESTING
    await session.commit()
    await session.refresh(assignment)
    return await build_assignment_read(session, assignment)


@router.post(
    "/assignments/{assignment_id}/provider-confirm",
    response_model=VehicleDeviceAssignmentRead,
)
async def confirm_provider_device(
    assignment_id: uuid.UUID,
    payload: TrackingDecision,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    assignment = await session.get(VehicleDeviceAssignment, assignment_id)
    if assignment is None or assignment.provider_id is None:
        raise HTTPException(status_code=404, detail="Provider tracking request not found")
    provider = await session.get(VTSProvider, assignment.provider_id)
    if provider is None or provider.tenant_id is None:
        raise HTTPException(status_code=409, detail="VTS provider scope is missing")
    if not await user_has_tenant_access(
        session,
        user_id=actor.id,
        tenant_id=provider.tenant_id,
    ):
        raise HTTPException(status_code=403, detail="You cannot confirm for this provider")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="VTS provider is not approved")
    if not await has_active_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=assignment.owner_id,
    ):
        raise HTTPException(
            status_code=409,
            detail="The owner-provider link is no longer active",
        )
    if assignment.status != TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION:
        raise HTTPException(
            status_code=409,
            detail="Tracking request is not awaiting confirmation",
        )

    source = await session.get(TelemetrySource, assignment.source_id)
    device = await session.get(TrackingDevice, assignment.device_id)
    vehicle = await session.get(Vehicle, assignment.vehicle_id)
    if source is None or device is None or vehicle is None:
        raise HTTPException(status_code=409, detail="Tracking request is incomplete")
    now = datetime.now(UTC)
    assignment.provider_confirmed_by_user_id = actor.id
    assignment.provider_confirmed_at = now
    if payload.decision == TrackingReviewDecision.APPROVE:
        if vehicle.verification_status != VehicleVerificationStatus.VERIFIED:
            raise HTTPException(status_code=409, detail="Vehicle is no longer verified")
        await end_active_vehicle_assignments(
            session,
            vehicle_id=vehicle.id,
            except_assignment_id=assignment.id,
        )
        assignment.status = TrackingAssignmentStatus.ACTIVE
        assignment.approved_at = now
        assignment.rejection_reason = None
        source.status = TelemetrySourceStatus.ACTIVE
        source.approved_at = source.approved_at or now
        device.certification_status = DeviceCertificationStatus.APPROVED
        device.operational_status = DeviceOperationalStatus.ACTIVE
    else:
        assignment.status = TrackingAssignmentStatus.REJECTED
        assignment.valid_to = now
        assignment.is_primary = False
        assignment.rejection_reason = payload.notes
        device.certification_status = DeviceCertificationStatus.REJECTED
        device.operational_status = DeviceOperationalStatus.SUSPENDED
    await session.commit()
    await session.refresh(assignment)
    return await build_assignment_read(session, assignment)


@router.post(
    "/assignments/{assignment_id}/review",
    response_model=VehicleDeviceAssignmentRead,
)
async def review_owner_managed_device(
    assignment_id: uuid.UUID,
    payload: TrackingDecision,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    assignment = await session.get(VehicleDeviceAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Tracking assignment not found")
    source = await session.get(TelemetrySource, assignment.source_id)
    device = await session.get(TrackingDevice, assignment.device_id)
    vehicle = await session.get(Vehicle, assignment.vehicle_id)
    if source is None or device is None or vehicle is None:
        raise HTTPException(status_code=409, detail="Tracking request is incomplete")
    if source.source_type != TelemetrySourceType.OWNER_MANAGED:
        raise HTTPException(status_code=400, detail="VTS devices use provider confirmation")
    if assignment.status != TrackingAssignmentStatus.TESTING:
        raise HTTPException(status_code=409, detail="Device is not awaiting review")

    now = datetime.now(UTC)
    assignment.approved_by_user_id = actor.id
    assignment.approved_at = now
    if payload.decision == TrackingReviewDecision.APPROVE:
        if device.last_tested_at is None:
            raise HTTPException(status_code=409, detail="A successful test payload is required")
        if vehicle.verification_status != VehicleVerificationStatus.VERIFIED:
            raise HTTPException(status_code=409, detail="Vehicle is no longer verified")
        await end_active_vehicle_assignments(
            session,
            vehicle_id=vehicle.id,
            except_assignment_id=assignment.id,
        )
        assignment.status = TrackingAssignmentStatus.ACTIVE
        assignment.rejection_reason = None
        source.status = TelemetrySourceStatus.ACTIVE
        source.approved_by_id = actor.id
        source.approved_at = now
        device.certification_status = DeviceCertificationStatus.APPROVED
        device.operational_status = DeviceOperationalStatus.ACTIVE
    else:
        assignment.status = TrackingAssignmentStatus.REJECTED
        assignment.valid_to = now
        assignment.is_primary = False
        assignment.rejection_reason = payload.notes
        device.certification_status = DeviceCertificationStatus.REJECTED
        device.operational_status = DeviceOperationalStatus.SUSPENDED
    await session.commit()
    await session.refresh(assignment)
    return await build_assignment_read(session, assignment)


@router.get("/assignments", response_model=TrackingAssignmentPage)
async def list_tracking_assignments(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    assignment_status: Annotated[
        TrackingAssignmentStatus | None,
        Query(alias="status"),
    ] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> TrackingAssignmentPage:
    query = select(VehicleDeviceAssignment)
    if assignment_status:
        query = query.where(VehicleDeviceAssignment.status == assignment_status)
    assignments = list(
        await session.scalars(query.order_by(VehicleDeviceAssignment.created_at.desc()))
    )
    accessible: list[VehicleDeviceAssignment] = []
    for assignment in assignments:
        try:
            await ensure_assignment_access(
                session,
                actor=actor,
                assignment=assignment,
            )
        except HTTPException as exc:
            if exc.status_code == 403:
                continue
            raise
        accessible.append(assignment)
    page = accessible[offset : offset + limit]
    return TrackingAssignmentPage(
        items=[await build_assignment_read(session, item) for item in page],
        total=len(accessible),
        offset=offset,
        limit=limit,
    )


@router.get(
    "/assignments/{assignment_id}",
    response_model=VehicleDeviceAssignmentRead,
)
async def get_tracking_assignment(
    assignment_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDeviceAssignmentRead:
    assignment = await session.get(VehicleDeviceAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Tracking assignment not found")
    await ensure_assignment_access(session, actor=actor, assignment=assignment)
    return await build_assignment_read(session, assignment)
