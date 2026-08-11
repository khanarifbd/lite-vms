import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    MembershipStatus,
    TelemetrySourceStatus,
    TelemetrySourceType,
    TrackingAssignmentStatus,
)
from app.modules.iam.model import OrganizationMembership, Tenant
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.tracking.model import (
    TelemetrySource,
    TrackingDevice,
    VehicleDeviceAssignment,
)
from app.modules.tracking.schema import (
    TelemetrySourceRead,
    TrackingDeviceRead,
    VehicleDeviceAssignmentRead,
)


def generate_source_code(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(5).upper()}"


async def user_has_tenant_access(session: AsyncSession, *, user_id: int, tenant_id: int) -> bool:
    membership = await session.scalar(
        select(OrganizationMembership.id).where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.tenant_id == tenant_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
        )
    )
    return membership is not None


async def get_or_create_provider_source(
    session: AsyncSession, provider: VTSProvider
) -> TelemetrySource:
    if provider.tenant_id is None:
        raise ValueError("VTS provider tenant is missing")
    source = await session.scalar(
        select(TelemetrySource).where(TelemetrySource.provider_id == provider.id)
    )
    if source is None:
        source = TelemetrySource(
            code=generate_source_code("VTS"),
            source_type=TelemetrySourceType.VTS_PROVIDER,
            tenant_id=provider.tenant_id,
            provider_id=provider.id,
            status=TelemetrySourceStatus.ACTIVE,
            approved_at=datetime.now(UTC),
        )
        session.add(source)
        await session.flush()
    return source


async def get_or_create_owner_source(session: AsyncSession, owner: VehicleOwner) -> TelemetrySource:
    if owner.tenant_id is None:
        raise ValueError("Vehicle-owner tenant is missing")
    source = await session.scalar(
        select(TelemetrySource).where(TelemetrySource.owner_id == owner.id)
    )
    if source is None:
        source = TelemetrySource(
            code=generate_source_code("OWNER"),
            source_type=TelemetrySourceType.OWNER_MANAGED,
            tenant_id=owner.tenant_id,
            owner_id=owner.id,
            status=TelemetrySourceStatus.TESTING,
        )
        session.add(source)
        await session.flush()
    return source


async def end_active_vehicle_assignments(
    session: AsyncSession,
    *,
    vehicle_id: uuid.UUID,
    except_assignment_id: uuid.UUID | None = None,
) -> None:
    query = select(VehicleDeviceAssignment).where(
        VehicleDeviceAssignment.vehicle_id == vehicle_id,
        VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
    )
    if except_assignment_id is not None:
        query = query.where(VehicleDeviceAssignment.id != except_assignment_id)
    assignments = list(await session.scalars(query))
    now = datetime.now(UTC)
    for assignment in assignments:
        assignment.status = TrackingAssignmentStatus.ENDED
        assignment.valid_to = now
        assignment.is_primary = False


async def build_assignment_read(
    session: AsyncSession, assignment: VehicleDeviceAssignment
) -> VehicleDeviceAssignmentRead:
    source = await session.get(TelemetrySource, assignment.source_id)
    device = await session.get(TrackingDevice, assignment.device_id)
    if source is None or device is None:
        raise RuntimeError("Tracking assignment source or device is missing")
    tenant = await session.get(Tenant, source.tenant_id)
    if tenant is None:
        raise RuntimeError("Tracking source tenant is missing")
    return VehicleDeviceAssignmentRead(
        id=assignment.id,
        vehicle_id=assignment.vehicle_id,
        owner_id=assignment.owner_id,
        provider_id=assignment.provider_id,
        source=TelemetrySourceRead(
            id=source.id,
            code=source.code,
            source_type=source.source_type,
            tenant_public_id=tenant.public_id,
            provider_id=source.provider_id,
            owner_id=source.owner_id,
            status=source.status,
            approved_at=source.approved_at,
            status_reason=source.status_reason,
        ),
        device=TrackingDeviceRead(
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
        ),
        account_reference=assignment.account_reference,
        valid_from=assignment.valid_from,
        valid_to=assignment.valid_to,
        status=assignment.status,
        is_primary=assignment.is_primary,
        provider_confirmed_at=assignment.provider_confirmed_at,
        approved_at=assignment.approved_at,
        rejection_reason=assignment.rejection_reason,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
    )
