import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EntityStatus, MembershipStatus, TrackingAssignmentStatus
from app.modules.auth.model import User
from app.modules.iam.model import Organization, OrganizationMembership, Tenant
from app.modules.owners.enums import OwnerProviderLinkStatus
from app.modules.owners.model import VTSProviderOwnerLink
from app.modules.providers.model import VTSProvider, VTSProviderAllowedIP, VTSProviderDocument
from app.modules.providers.schema import (
    ProviderApplicationRead,
    ProviderDocumentCreate,
    ProviderDocumentRead,
)
from app.modules.tracking.model import TelemetrySource, TrackingDevice, VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle


def generate_application_number() -> str:
    return f"VTS-{datetime.now(UTC):%Y%m%d}-{secrets.token_hex(4).upper()}"


def generate_provider_code() -> str:
    return f"VTS-{secrets.token_hex(4).upper()}"


async def get_provider_by_id(session: AsyncSession, provider_id: uuid.UUID) -> VTSProvider | None:
    return await session.get(VTSProvider, provider_id)


async def get_provider_for_user(session: AsyncSession, user_id: int) -> VTSProvider | None:
    accessible_tenant_ids = select(OrganizationMembership.tenant_id).where(
        OrganizationMembership.user_id == user_id,
        OrganizationMembership.status == MembershipStatus.ACTIVE,
    )

    return await session.scalar(
        select(VTSProvider).where(
            or_(
                VTSProvider.primary_admin_user_id == user_id,
                VTSProvider.tenant_id.in_(accessible_tenant_ids),
            )
        )
    )


async def replace_provider_documents(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    documents: list[ProviderDocumentCreate],
) -> None:
    for document in documents:
        previous = await session.scalar(
            select(VTSProviderDocument)
            .where(
                VTSProviderDocument.provider_id == provider_id,
                VTSProviderDocument.document_type == document.document_type,
                VTSProviderDocument.is_active.is_(True),
            )
            .order_by(VTSProviderDocument.version.desc())
        )
        version = previous.version + 1 if previous else 1
        new_document = VTSProviderDocument(
            provider_id=provider_id,
            **document.model_dump(),
            version=version,
            is_active=True,
        )
        session.add(new_document)
        await session.flush()
        if previous:
            previous.is_active = False
            previous.replaced_by_id = new_document.id
    await session.flush()


async def replace_allowed_ips(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    ip_addresses: list[str],
) -> None:
    existing = list(
        await session.scalars(
            select(VTSProviderAllowedIP).where(VTSProviderAllowedIP.provider_id == provider_id)
        )
    )
    existing_by_ip = {item.ip_address: item for item in existing}
    requested = set(ip_addresses)
    for item in existing:
        if item.ip_address not in requested:
            await session.delete(item)
    for ip_address in requested:
        if ip_address not in existing_by_ip:
            session.add(VTSProviderAllowedIP(provider_id=provider_id, ip_address=ip_address))
    await session.flush()


async def build_provider_read(
    session: AsyncSession,
    provider: VTSProvider,
) -> ProviderApplicationRead:
    if (
        provider.tenant_id is None
        or provider.root_organization_id is None
        or provider.primary_admin_user_id is None
        or provider.application_number is None
        or provider.license_number is None
        or provider.trade_license_number is None
        or provider.registered_address is None
        or provider.district is None
        or provider.contact_person is None
        or provider.phone is None
        or provider.email is None
        or provider.technical_contact_name is None
        or provider.technical_contact_phone is None
        or provider.technical_contact_email is None
        or provider.submitted_at is None
    ):
        raise RuntimeError("VTS provider is a legacy or incomplete record")

    tenant = await session.get(Tenant, provider.tenant_id)
    organization = await session.get(Organization, provider.root_organization_id)
    admin = await session.get(User, provider.primary_admin_user_id)
    if tenant is None or organization is None or admin is None:
        raise RuntimeError("VTS provider identity scope is missing")

    documents = list(
        await session.scalars(
            select(VTSProviderDocument)
            .where(
                VTSProviderDocument.provider_id == provider.id,
                VTSProviderDocument.is_active.is_(True),
            )
            .order_by(VTSProviderDocument.document_type, VTSProviderDocument.version.desc())
        )
    )
    allowed_ips = list(
        await session.scalars(
            select(VTSProviderAllowedIP.ip_address)
            .where(VTSProviderAllowedIP.provider_id == provider.id)
            .order_by(VTSProviderAllowedIP.ip_address)
        )
    )
    linked_owner_count = int(
        await session.scalar(
            select(func.count(VTSProviderOwnerLink.id)).where(
                VTSProviderOwnerLink.provider_id == provider.id,
                VTSProviderOwnerLink.status == OwnerProviderLinkStatus.ACTIVE,
            )
        )
        or 0
    )
    registered_device_count = int(
        await session.scalar(
            select(func.count(TrackingDevice.id)).where(TrackingDevice.provider_id == provider.id)
        )
        or 0
    )
    active_vehicle_count = int(
        await session.scalar(
            select(func.count(func.distinct(VehicleDeviceAssignment.vehicle_id))).where(
                VehicleDeviceAssignment.provider_id == provider.id,
                VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            )
        )
        or 0
    )
    online_cutoff = datetime.now(UTC) - timedelta(minutes=5)
    online_vehicle_count = int(
        await session.scalar(
            select(func.count(func.distinct(Vehicle.id)))
            .join(
                VehicleDeviceAssignment,
                VehicleDeviceAssignment.vehicle_id == Vehicle.id,
            )
            .where(
                VehicleDeviceAssignment.provider_id == provider.id,
                VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
                Vehicle.status == EntityStatus.ACTIVE,
                Vehicle.last_recorded_at.is_not(None),
                Vehicle.last_recorded_at >= online_cutoff,
            )
        )
        or 0
    )
    source = await session.scalar(
        select(TelemetrySource).where(TelemetrySource.provider_id == provider.id)
    )
    provider_staff_count = int(
        await session.scalar(
            select(func.count(OrganizationMembership.id)).where(
                OrganizationMembership.tenant_id == provider.tenant_id,
                OrganizationMembership.status == MembershipStatus.ACTIVE,
            )
        )
        or 0
    )

    return ProviderApplicationRead(
        id=provider.id,
        application_number=provider.application_number,
        code=provider.code,
        tenant_public_id=tenant.public_id,
        organization_public_id=organization.public_id,
        primary_admin_user_public_id=admin.public_id,
        legal_name=provider.name,
        trade_name=provider.trade_name,
        company_type=provider.company_type,
        incorporation_date=provider.incorporation_date,
        btrc_license_number=provider.license_number,
        btrc_license_issue_date=provider.btrc_license_issue_date,
        btrc_license_expiry_date=provider.btrc_license_expiry_date,
        trade_license_number=provider.trade_license_number,
        trade_license_expiry_date=provider.trade_license_expiry_date,
        company_registration_number=provider.company_registration_number,
        tin_number=provider.tin_number,
        bin_number=provider.bin_number,
        registered_address=provider.registered_address,
        district=provider.district,
        website_url=provider.website_url,
        authorized_representative_name=provider.authorized_representative_name,
        authorized_representative_nid=provider.authorized_representative_nid,
        authorized_representative_designation=provider.authorized_representative_designation,
        authorized_representative_mobile=provider.authorized_representative_mobile,
        authorized_representative_email=provider.authorized_representative_email,
        contact_person=provider.contact_person,
        phone=provider.phone,
        email=provider.email,
        technical_contact_name=provider.technical_contact_name,
        technical_contact_phone=provider.technical_contact_phone,
        technical_contact_email=provider.technical_contact_email,
        operations_contact_name=provider.operations_contact_name,
        operations_contact_phone=provider.operations_contact_phone,
        operations_contact_email=provider.operations_contact_email,
        support_contact_name=provider.support_contact_name,
        support_contact_phone=provider.support_contact_phone,
        support_contact_email=provider.support_contact_email,
        emergency_contact_name=provider.emergency_contact_name,
        emergency_contact_phone=provider.emergency_contact_phone,
        emergency_contact_email=provider.emergency_contact_email,
        service_coverage=provider.service_coverage or [],
        supported_protocols=provider.supported_protocols or [],
        supported_device_brands=provider.supported_device_brands or [],
        api_base_url=provider.api_base_url,
        estimated_vehicle_count=provider.estimated_vehicle_count,
        current_platform_name=provider.current_platform_name,
        data_submission_interval_seconds=provider.data_submission_interval_seconds,
        integration_status=provider.integration_status,
        last_telemetry_received_at=provider.last_telemetry_received_at,
        allowed_server_ips=allowed_ips,
        documents=[
            ProviderDocumentRead(
                id=document.id,
                document_type=document.document_type,
                document_number=document.document_number,
                storage_key=document.storage_key or "legacy/missing",
                file_name=document.file_name,
                content_type=document.content_type,
                size_bytes=document.size_bytes,
                expires_at=document.expires_at,
                status=document.status,
                version=document.version,
                is_active=document.is_active,
                replaced_by_id=document.replaced_by_id,
                verified_at=document.verified_at,
                review_notes=document.review_notes,
            )
            for document in documents
        ],
        linked_owner_count=linked_owner_count,
        registered_device_count=registered_device_count,
        active_vehicle_count=active_vehicle_count,
        online_vehicle_count=online_vehicle_count,
        telemetry_source_id=source.id if source else None,
        telemetry_source_code=source.code if source else None,
        telemetry_source_status=source.status.value if source else None,
        provider_staff_count=provider_staff_count,
        declaration_accepted=provider.declaration_accepted,
        submitted_at=provider.submitted_at,
        reviewed_at=provider.reviewed_at,
        review_notes=provider.review_notes,
        status=provider.status,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )
