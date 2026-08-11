import asyncio
import hashlib
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    DeviceCertificationStatus,
    DeviceOperationalStatus,
    DeviceOwnershipType,
    ProviderStatus,
    TelemetrySourceStatus,
    TelemetrySourceType,
    TrackingAssignmentStatus,
    VehicleVerificationStatus,
)
from app.core.config import settings
from app.core.database import get_session
from app.modules.owners.access_service import has_active_provider_vehicle_access
from app.modules.providers.api_key_service import (
    ProviderAPIKeyAuthenticationError,
    authenticate_provider_api_key,
)
from app.modules.providers.model import VTSProvider
from app.modules.telemetry.kafka import telemetry_kafka_producer
from app.modules.telemetry.schema import (
    RejectedPacket,
    TrackingBatchAck,
    TrackingBatchIn,
    TrackingPacket,
)
from app.modules.tracking.model import (
    TelemetrySource,
    TrackingDevice,
    VehicleDeviceAssignment,
)
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.normalization import normalize_bangladesh_registration

router = APIRouter(prefix="/telemetry", tags=["Telemetry Ingestion"])


CURRENT_ASSIGNMENT_STATUSES = {
    TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
    TrackingAssignmentStatus.TESTING,
    TrackingAssignmentStatus.ACTIVE,
}


def normalize_registration_number(value: str) -> str:
    """Use the same canonical BRTA identity used when vehicles are registered."""
    try:
        return normalize_bangladesh_registration(value)
    except ValueError:
        return "".join(character for character in value.upper() if character.isalnum())


def normalize_imei(value: str) -> str:
    return "".join(character for character in value.strip() if character.isdigit())


def build_packet_id(*, provider_id: uuid.UUID, packet: TrackingPacket) -> str:
    identity = "|".join(
        [
            str(provider_id),
            normalize_registration_number(packet.registration_number),
            packet.imei.strip(),
            packet.op,
            packet.dt_tracker.astimezone(UTC).isoformat(),
            "" if packet.lat is None else f"{packet.lat:.7f}",
            "" if packet.lng is None else f"{packet.lng:.7f}",
            packet.event or "",
        ]
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def request_ip(request: Request) -> str | None:
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else None


async def resolve_test_provider_source(
    session: AsyncSession,
) -> tuple[TelemetrySource, VTSProvider]:
    if not settings.telemetry_allow_unauthenticated_test:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "TELEMETRY_API_KEY_REQUIRED",
                "message": "Send the provider API key in the X-API-Key header",
            },
        )

    rows = (
        await session.execute(
            select(TelemetrySource, VTSProvider)
            .join(VTSProvider, VTSProvider.id == TelemetrySource.provider_id)
            .where(
                TelemetrySource.source_type == TelemetrySourceType.VTS_PROVIDER,
                TelemetrySource.provider_id.is_not(None),
                TelemetrySource.status.in_(
                    [TelemetrySourceStatus.ACTIVE, TelemetrySourceStatus.TESTING]
                ),
                VTSProvider.status == ProviderStatus.APPROVED,
            )
        )
    ).all()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "TEST_PROVIDER_SOURCE_MISSING",
                "message": "Create one approved provider with one active/testing telemetry source",
            },
        )
    if len(rows) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "TEST_PROVIDER_SOURCE_AMBIGUOUS",
                "message": (
                    "Unauthenticated test mode requires exactly one approved provider "
                    "telemetry source. Use X-API-Key instead."
                ),
            },
        )

    source, provider = rows[0]
    return source, provider


async def resolve_provider_source(
    session: AsyncSession,
    *,
    request: Request,
    api_key: str | None,
) -> tuple[TelemetrySource, VTSProvider]:
    if api_key and api_key.strip():
        try:
            return await authenticate_provider_api_key(
                session,
                api_key=api_key.strip(),
                client_ip=request_ip(request),
            )
        except ProviderAPIKeyAuthenticationError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": exc.code, "message": exc.message},
                headers={"WWW-Authenticate": "ApiKey"},
            ) from None

    return await resolve_test_provider_source(session)


async def find_verified_provider_vehicle(
    session: AsyncSession,
    *,
    provider: VTSProvider,
    packet: TrackingPacket,
) -> Vehicle | None:
    """Resolve a verified vehicle accessible through an active owner-provider link.

    Vehicle eligibility does not depend on who originally created the vehicle record.
    An owner-created vehicle is valid for telemetry as soon as its owner has granted
    this provider active access to it.
    """
    normalized_registration = normalize_registration_number(packet.registration_number)
    vehicle = await session.scalar(
        select(Vehicle).where(
            Vehicle.registration_number == normalized_registration,
            Vehicle.verification_status == VehicleVerificationStatus.VERIFIED,
        )
    )
    if vehicle is None:
        return None

    has_access = await has_active_provider_vehicle_access(
        session,
        provider_id=provider.id,
        owner_id=vehicle.owner_id,
        vehicle_id=vehicle.id,
    )
    return vehicle if has_access else None


async def auto_bind_first_packet(
    session: AsyncSession,
    *,
    source: TelemetrySource,
    provider: VTSProvider,
    packet: TrackingPacket,
    received_at: datetime,
) -> tuple[VehicleDeviceAssignment, Vehicle, TrackingDevice] | None:
    """Bind the first real IMEI packet to an eligible verified provider vehicle.

    This intentionally never replaces a different current device. Once a vehicle has a
    current assignment, changing IMEI must use the explicit replacement workflow.
    """
    vehicle = await find_verified_provider_vehicle(
        session,
        provider=provider,
        packet=packet,
    )
    if vehicle is None or provider.primary_admin_user_id is None:
        return None

    current_assignment = await session.scalar(
        select(VehicleDeviceAssignment)
        .where(
            VehicleDeviceAssignment.vehicle_id == vehicle.id,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.status.in_(CURRENT_ASSIGNMENT_STATUSES),
        )
        .order_by(VehicleDeviceAssignment.valid_from.desc())
    )
    normalized_packet_imei = normalize_imei(packet.imei)

    if current_assignment is not None:
        current_device = await session.get(TrackingDevice, current_assignment.device_id)
        if (
            current_device is None
            or current_assignment.provider_id != provider.id
            or current_assignment.source_id != source.id
            or normalize_imei(current_device.imei or current_device.device_identifier)
            != normalized_packet_imei
        ):
            return None

        current_device.device_identifier = normalized_packet_imei
        current_device.imei = normalized_packet_imei
        current_device.protocol = current_device.protocol or packet.protocol
        current_device.certification_status = DeviceCertificationStatus.APPROVED
        current_device.operational_status = DeviceOperationalStatus.ACTIVE
        current_device.last_tested_at = received_at
        current_device.last_seen_at = received_at
        current_assignment.status = TrackingAssignmentStatus.ACTIVE
        current_assignment.provider_confirmed_by_user_id = provider.primary_admin_user_id
        current_assignment.provider_confirmed_at = received_at
        current_assignment.approved_by_user_id = provider.primary_admin_user_id
        current_assignment.approved_at = received_at
        await session.flush()
        return current_assignment, vehicle, current_device

    device = await session.scalar(
        select(TrackingDevice).where(TrackingDevice.imei == normalized_packet_imei)
    )
    if device is not None:
        if device.provider_id != provider.id or device.source_id != source.id:
            return None
        occupied = await session.scalar(
            select(VehicleDeviceAssignment.id).where(
                VehicleDeviceAssignment.device_id == device.id,
                VehicleDeviceAssignment.valid_to.is_(None),
                VehicleDeviceAssignment.status.in_(CURRENT_ASSIGNMENT_STATUSES),
            )
        )
        if occupied is not None:
            return None
    else:
        device = TrackingDevice(
            source_id=source.id,
            device_identifier=normalized_packet_imei,
            imei=normalized_packet_imei,
            protocol=packet.protocol,
            ownership_type=DeviceOwnershipType.PROVIDER_OWNED,
            provider_id=provider.id,
            certification_status=DeviceCertificationStatus.APPROVED,
            operational_status=DeviceOperationalStatus.ACTIVE,
            last_tested_at=received_at,
            last_seen_at=received_at,
        )
        session.add(device)
        await session.flush()

    device.device_identifier = normalized_packet_imei
    device.imei = normalized_packet_imei
    device.protocol = device.protocol or packet.protocol
    device.certification_status = DeviceCertificationStatus.APPROVED
    device.operational_status = DeviceOperationalStatus.ACTIVE
    device.last_tested_at = received_at
    device.last_seen_at = received_at

    assignment = VehicleDeviceAssignment(
        vehicle_id=vehicle.id,
        device_id=device.id,
        source_id=source.id,
        provider_id=provider.id,
        owner_id=vehicle.owner_id,
        valid_from=received_at,
        status=TrackingAssignmentStatus.ACTIVE,
        is_primary=True,
        submitted_by_user_id=provider.primary_admin_user_id,
        provider_confirmed_by_user_id=provider.primary_admin_user_id,
        provider_confirmed_at=received_at,
        approved_by_user_id=provider.primary_admin_user_id,
        approved_at=received_at,
    )
    session.add(assignment)
    await session.flush()
    return assignment, vehicle, device


async def resolve_packet_mapping(
    session: AsyncSession,
    *,
    source: TelemetrySource,
    provider: VTSProvider,
    packet: TrackingPacket,
    received_at: datetime,
) -> tuple[VehicleDeviceAssignment, Vehicle, TrackingDevice] | None:
    normalized_registration = normalize_registration_number(packet.registration_number)
    rows = (
        await session.execute(
            select(VehicleDeviceAssignment, Vehicle, TrackingDevice)
            .join(Vehicle, Vehicle.id == VehicleDeviceAssignment.vehicle_id)
            .join(TrackingDevice, TrackingDevice.id == VehicleDeviceAssignment.device_id)
            .where(
                VehicleDeviceAssignment.source_id == source.id,
                VehicleDeviceAssignment.provider_id == provider.id,
                VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
                VehicleDeviceAssignment.valid_to.is_(None),
                Vehicle.registration_number == normalized_registration,
            )
        )
    ).first()
    if rows is not None:
        assignment, vehicle, device = rows
        device_identity = normalize_imei(device.imei or device.device_identifier)
        if (
            device_identity == normalize_imei(packet.imei)
            and device.operational_status == DeviceOperationalStatus.ACTIVE
            and vehicle.verification_status == VehicleVerificationStatus.VERIFIED
        ):
            device.last_seen_at = received_at
            return assignment, vehicle, device
        return None

    return await auto_bind_first_packet(
        session,
        source=source,
        provider=provider,
        packet=packet,
        received_at=received_at,
    )


def make_internal_event(
    *,
    packet: TrackingPacket,
    packet_id: str,
    request_id: uuid.UUID,
    batch_id: uuid.UUID,
    batch_index: int,
    received_at: datetime,
    source: TelemetrySource,
    provider: VTSProvider,
    assignment: VehicleDeviceAssignment,
    vehicle: Vehicle,
    device: TrackingDevice,
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "packet_id": packet_id,
        "request_id": str(request_id),
        "batch_id": str(batch_id),
        "batch_index": batch_index,
        "tenant_id": str(source.tenant_id),
        "vehicle_id": str(vehicle.id),
        "provider_id": str(provider.id),
        "source_id": str(source.id),
        "assignment_id": str(assignment.id),
        "device_id": str(device.id),
        "registration_number": normalize_registration_number(packet.registration_number),
        "registration_number_display": packet.registration_number,
        "imei": normalize_imei(packet.imei),
        "op": packet.op,
        "dt_tracker": packet.dt_tracker.astimezone(UTC).isoformat(),
        "dt_provider_received": packet.dt_provider_received.astimezone(UTC).isoformat(),
        "dt_server": received_at.isoformat(),
        "lat": packet.lat,
        "lng": packet.lng,
        "speed": packet.speed,
        "angle": packet.angle,
        "altitude": packet.altitude,
        "loc_valid": packet.loc_valid,
        "params": packet.params,
        "protocol": packet.protocol,
        "net_protocol": packet.net_protocol,
        "ip": packet.ip,
        "port": packet.port,
        "event": packet.event,
    }


@router.post("", response_model=TrackingBatchAck, status_code=status.HTTP_202_ACCEPTED)
async def ingest_telemetry_batch(
    payload: TrackingBatchIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> TrackingBatchAck:
    request_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    received_at = datetime.now(UTC)
    source, provider = await resolve_provider_source(
        session,
        request=request,
        api_key=x_api_key,
    )

    rejected_items: list[RejectedPacket] = []
    publish_jobs: list[tuple[str, dict[str, Any]]] = []

    for index, packet in enumerate(payload.packets):
        mapping = await resolve_packet_mapping(
            session,
            source=source,
            provider=provider,
            packet=packet,
            received_at=received_at,
        )
        if mapping is None:
            rejected_items.append(
                RejectedPacket(
                    index=index,
                    code="VEHICLE_DEVICE_MAPPING_INVALID",
                    message=(
                        "No verified vehicle with active provider access was found, or "
                        "this vehicle is already assigned to a different IMEI"
                    ),
                )
            )
            continue

        assignment, vehicle, device = mapping
        packet_id = build_packet_id(provider_id=provider.id, packet=packet)
        event = make_internal_event(
            packet=packet,
            packet_id=packet_id,
            request_id=request_id,
            batch_id=batch_id,
            batch_index=index,
            received_at=received_at,
            source=source,
            provider=provider,
            assignment=assignment,
            vehicle=vehicle,
            device=device,
        )
        publish_jobs.append((str(vehicle.id), event))

    try:
        await asyncio.gather(
            *(
                telemetry_kafka_producer.publish_packet(key=key, event=event)
                for key, event in publish_jobs
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "STREAM_UNAVAILABLE",
                "message": "Packets were not accepted; retry the same payload",
            },
        ) from exc

    accepted = len(publish_jobs)
    rejected = len(rejected_items)
    response_status = (
        "accepted" if rejected == 0 else "rejected" if accepted == 0 else "partially_accepted"
    )

    provider.last_telemetry_received_at = received_at
    provider.integration_status = "connected"
    await session.commit()

    return TrackingBatchAck(
        status=response_status,
        request_id=request_id,
        batch_id=batch_id,
        received=len(payload.packets),
        accepted=accepted,
        rejected=rejected,
        rejected_items=rejected_items,
        received_at=received_at,
    )