import re
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EntityStatus, IdentifierType, MembershipStatus
from app.modules.auth.model import User, UserIdentifier
from app.modules.drivers.enums import DriverLinkStatus
from app.modules.drivers.model import VehicleOwnerDriverLink
from app.modules.iam.model import Organization, OrganizationMembership, Tenant
from app.modules.owners.enums import OwnerProviderLinkStatus, OwnerProviderRequestSource
from app.modules.owners.model import VehicleOwner, VehicleOwnerDocument, VTSProviderOwnerLink
from app.modules.owners.schema import (
    OwnerApplicationRead,
    OwnerDocumentCreate,
    OwnerDocumentRead,
    OwnerProviderLinkRead,
    ProviderLinkSummary,
)
from app.modules.providers.model import VTSProvider
from app.modules.vehicles.model import Vehicle


def generate_owner_application_number() -> str:
    return f"OWN-{datetime.now(UTC):%Y%m%d}-{secrets.token_hex(4).upper()}"


def generate_owner_code() -> str:
    return f"OWNER-{secrets.token_hex(4).upper()}"


def normalize_owner_identity(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]", "", value).upper()
    if len(normalized) < 3:
        raise ValueError("A valid NID or registration reference is required")
    return normalized


def mask_owner_identity(value: str) -> str:
    return value


def mask_owner_phone(value: str | None) -> str | None:
    return value


async def get_owner_username(session: AsyncSession, owner: VehicleOwner) -> str | None:
    if owner.primary_admin_user_id is None:
        return None
    return await session.scalar(
        select(UserIdentifier.normalized_value).where(
            UserIdentifier.user_id == owner.primary_admin_user_id,
            UserIdentifier.identifier_type == IdentifierType.USERNAME,
            UserIdentifier.disabled_at.is_(None),
        )
    )


async def get_owner_masked_username(session: AsyncSession, owner: VehicleOwner) -> str | None:
    return await get_owner_username(session, owner)


async def get_owner_by_id(session: AsyncSession, owner_id: uuid.UUID) -> VehicleOwner | None:
    return await session.get(VehicleOwner, owner_id)


async def get_owner_by_identity(
    session: AsyncSession, identity_reference: str
) -> VehicleOwner | None:
    normalized = normalize_owner_identity(identity_reference)
    return await session.scalar(
        select(VehicleOwner).where(VehicleOwner.nid_or_registration == normalized)
    )


async def get_owner_for_user(session: AsyncSession, user_id: int) -> VehicleOwner | None:
    direct = await session.scalar(
        select(VehicleOwner).where(VehicleOwner.primary_admin_user_id == user_id)
    )
    if direct is not None:
        return direct
    tenant_ids = select(OrganizationMembership.tenant_id).where(
        OrganizationMembership.user_id == user_id,
        OrganizationMembership.status == MembershipStatus.ACTIVE,
    )
    return await session.scalar(select(VehicleOwner).where(VehicleOwner.tenant_id.in_(tenant_ids)))


async def user_can_access_owner(
    session: AsyncSession, *, user_id: int, owner: VehicleOwner
) -> bool:
    if owner.primary_admin_user_id == user_id:
        return True
    if owner.tenant_id is None:
        return False
    membership = await session.scalar(
        select(OrganizationMembership.id).where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.tenant_id == owner.tenant_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
        )
    )
    return membership is not None


async def get_provider_owner_link(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    owner_id: uuid.UUID,
) -> VTSProviderOwnerLink | None:
    return await session.scalar(
        select(VTSProviderOwnerLink).where(
            VTSProviderOwnerLink.provider_id == provider_id,
            VTSProviderOwnerLink.owner_id == owner_id,
        )
    )


async def has_active_provider_owner_link(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    owner_id: uuid.UUID,
) -> bool:
    link_id = await session.scalar(
        select(VTSProviderOwnerLink.id).where(
            VTSProviderOwnerLink.provider_id == provider_id,
            VTSProviderOwnerLink.owner_id == owner_id,
            VTSProviderOwnerLink.status == OwnerProviderLinkStatus.ACTIVE,
        )
    )
    return link_id is not None


async def provider_can_access_owner(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    owner_id: uuid.UUID,
) -> bool:
    link_id = await session.scalar(
        select(VTSProviderOwnerLink.id).where(
            VTSProviderOwnerLink.provider_id == provider_id,
            VTSProviderOwnerLink.owner_id == owner_id,
            VTSProviderOwnerLink.status.in_(
                [
                    OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL,
                    OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL,
                    OwnerProviderLinkStatus.ACTIVE,
                    OwnerProviderLinkStatus.SUSPENDED,
                ]
            ),
        )
    )
    return link_id is not None


async def create_or_reopen_provider_owner_link(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    owner_id: uuid.UUID,
    requested_by: OwnerProviderRequestSource,
    requested_by_user_id: int,
) -> tuple[VTSProviderOwnerLink, bool]:
    target_status = (
        OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL
        if requested_by == OwnerProviderRequestSource.PROVIDER
        else OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL
    )
    link = await get_provider_owner_link(
        session, provider_id=provider_id, owner_id=owner_id
    )
    if link is None:
        link = VTSProviderOwnerLink(
            provider_id=provider_id,
            owner_id=owner_id,
            status=target_status,
            requested_by=requested_by,
            requested_by_user_id=requested_by_user_id,
            requested_at=datetime.now(UTC),
        )
        session.add(link)
        await session.flush()
        return link, True

    if link.status in {
        OwnerProviderLinkStatus.ACTIVE,
        OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL,
        OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL,
        OwnerProviderLinkStatus.SUSPENDED,
    }:
        return link, False

    link.status = target_status
    link.requested_by = requested_by
    link.requested_by_user_id = requested_by_user_id
    link.requested_at = datetime.now(UTC)
    link.responded_by_user_id = None
    link.responded_at = None
    link.ended_by_user_id = None
    link.ended_at = None
    link.reason = None
    await session.flush()
    return link, True


async def create_or_activate_provider_owner_link(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    owner_id: uuid.UUID,
    requested_by_user_id: int,
) -> tuple[VTSProviderOwnerLink, bool]:
    """Create an active provider-owner link for provider-managed onboarding.

    The regular connection-request workflow remains available for owner-initiated
    and manual links. A provider that registers an owner from its own workspace
    is explicitly authorized to manage that owner immediately.
    """
    link = await get_provider_owner_link(
        session, provider_id=provider_id, owner_id=owner_id
    )
    if link is not None and link.status == OwnerProviderLinkStatus.ACTIVE:
        return link, False

    now = datetime.now(UTC)
    if link is None:
        link = VTSProviderOwnerLink(
            provider_id=provider_id,
            owner_id=owner_id,
            status=OwnerProviderLinkStatus.ACTIVE,
            requested_by=OwnerProviderRequestSource.PROVIDER,
            requested_by_user_id=requested_by_user_id,
            requested_at=now,
            responded_by_user_id=requested_by_user_id,
            responded_at=now,
        )
        session.add(link)
    else:
        link.status = OwnerProviderLinkStatus.ACTIVE
        link.requested_by = OwnerProviderRequestSource.PROVIDER
        link.requested_by_user_id = requested_by_user_id
        link.requested_at = now
        link.responded_by_user_id = requested_by_user_id
        link.responded_at = now
        link.ended_by_user_id = None
        link.ended_at = None
        link.reason = None
    await session.flush()
    return link, True


async def replace_owner_documents(
    session: AsyncSession,
    *,
    owner_id: uuid.UUID,
    documents: list[OwnerDocumentCreate],
) -> None:
    for document in documents:
        previous = await session.scalar(
            select(VehicleOwnerDocument)
            .where(
                VehicleOwnerDocument.owner_id == owner_id,
                VehicleOwnerDocument.document_type == document.document_type,
                VehicleOwnerDocument.is_active.is_(True),
            )
            .order_by(VehicleOwnerDocument.version.desc())
        )
        version = (previous.version + 1) if previous else 1
        new_document = VehicleOwnerDocument(
            owner_id=owner_id,
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


async def build_provider_link_summaries(
    session: AsyncSession, owner_id: uuid.UUID
) -> list[ProviderLinkSummary]:
    rows = (
        await session.execute(
            select(VTSProviderOwnerLink, VTSProvider)
            .join(VTSProvider, VTSProvider.id == VTSProviderOwnerLink.provider_id)
            .where(VTSProviderOwnerLink.owner_id == owner_id)
            .order_by(VTSProvider.name)
        )
    ).all()
    return [
        ProviderLinkSummary(
            provider_id=provider.id,
            provider_code=provider.code,
            provider_name=provider.name,
            status=link.status,
        )
        for link, provider in rows
    ]


async def build_link_read(
    session: AsyncSession, link: VTSProviderOwnerLink
) -> OwnerProviderLinkRead:
    owner = await session.get(VehicleOwner, link.owner_id)
    provider = await session.get(VTSProvider, link.provider_id)
    if owner is None or provider is None:
        raise RuntimeError("Owner-provider link scope is missing")
    return OwnerProviderLinkRead(
        id=link.id,
        owner_id=owner.id,
        owner_name=owner.name,
        identity_or_registration_reference=owner.nid_or_registration,
        provider_id=provider.id,
        provider_code=provider.code,
        provider_name=provider.name,
        status=link.status,
        requested_by=link.requested_by,
        requested_at=link.requested_at,
        responded_at=link.responded_at,
        ended_at=link.ended_at,
        reason=link.reason,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


async def build_owner_read(session: AsyncSession, owner: VehicleOwner) -> OwnerApplicationRead:
    if (
        owner.tenant_id is None
        or owner.root_organization_id is None
        or owner.application_number is None
        or owner.owner_code is None
        or owner.address is None
        or owner.district is None
    ):
        raise RuntimeError("Vehicle owner is a legacy or incomplete record")

    tenant = await session.get(Tenant, owner.tenant_id)
    organization = await session.get(Organization, owner.root_organization_id)
    admin = (
        await session.get(User, owner.primary_admin_user_id)
        if owner.primary_admin_user_id is not None
        else None
    )
    if tenant is None or organization is None:
        raise RuntimeError("Vehicle owner identity scope is missing")

    documents = list(
        await session.scalars(
            select(VehicleOwnerDocument)
            .where(
                VehicleOwnerDocument.owner_id == owner.id,
                VehicleOwnerDocument.is_active.is_(True),
            )
            .order_by(VehicleOwnerDocument.document_type, VehicleOwnerDocument.version.desc())
        )
    )
    linked_providers = await build_provider_link_summaries(session, owner.id)
    total_vehicles = int(
        await session.scalar(select(func.count(Vehicle.id)).where(Vehicle.owner_id == owner.id))
        or 0
    )
    active_vehicles = int(
        await session.scalar(
            select(func.count(Vehicle.id)).where(
                Vehicle.owner_id == owner.id,
                Vehicle.status == EntityStatus.ACTIVE,
            )
        )
        or 0
    )
    linked_drivers_count = int(
        await session.scalar(
            select(func.count(VehicleOwnerDriverLink.id)).where(
                VehicleOwnerDriverLink.owner_id == owner.id,
                VehicleOwnerDriverLink.status == DriverLinkStatus.ACTIVE,
            )
        )
        or 0
    )
    active_provider_links = [
        item for item in linked_providers if item.status == OwnerProviderLinkStatus.ACTIVE
    ]
    created_by_provider = (
        await session.get(VTSProvider, owner.created_by_provider_id)
        if owner.created_by_provider_id
        else None
    )
    username = await get_owner_username(session, owner)

    return OwnerApplicationRead(
        id=owner.id,
        application_number=owner.application_number,
        owner_code=owner.owner_code,
        tenant_public_id=tenant.public_id,
        organization_public_id=organization.public_id,
        primary_admin_user_public_id=admin.public_id if admin else None,
        created_by_provider_id=owner.created_by_provider_id,
        created_by_provider_name=created_by_provider.name if created_by_provider else None,
        owner_type=owner.owner_type,
        owner_name=owner.name,
        identity_or_registration_reference=owner.nid_or_registration,
        claim_status=owner.claim_status,
        date_of_birth=owner.date_of_birth,
        father_name=owner.father_name,
        mother_name=owner.mother_name,
        gender=owner.gender,
        profile_photo_storage_key=owner.profile_photo_storage_key,
        present_address=owner.present_address,
        permanent_address=owner.permanent_address,
        division=owner.division,
        upazila=owner.upazila,
        postal_code=owner.postal_code,
        alternate_phone=owner.alternate_phone,
        company_type=owner.company_type,
        incorporation_date=owner.incorporation_date,
        authorized_person_name=owner.authorized_person_name,
        authorized_person_nid=owner.authorized_person_nid,
        authorized_person_designation=owner.authorized_person_designation,
        authorized_person_mobile=owner.authorized_person_mobile,
        authorized_person_email=owner.authorized_person_email,
        company_logo_storage_key=owner.company_logo_storage_key,
        head_office_address=owner.head_office_address,
        operating_address=owner.operating_address,
        trade_license_number=owner.trade_license_number,
        tin_number=owner.tin_number,
        bin_number=owner.bin_number,
        phone=owner.phone,
        email=owner.email,
        account_username=username,
        account_status=admin.status.value if admin else None,
        registered_address=owner.address,
        district=owner.district,
        website_url=owner.website_url,
        documents=[
            OwnerDocumentRead(
                id=document.id,
                document_type=document.document_type,
                document_reference=document.document_reference,
                storage_key=document.storage_key or document.file_url or "legacy/missing",
                file_url=document.file_url,
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
        linked_providers=linked_providers,
        total_vehicles=total_vehicles,
        active_vehicles=active_vehicles,
        linked_drivers_count=linked_drivers_count,
        active_vts_providers_count=len(active_provider_links),
        primary_vts_provider=active_provider_links[0] if active_provider_links else None,
        declaration_accepted=owner.declaration_accepted,
        submitted_at=owner.submitted_at,
        reviewed_at=owner.reviewed_at,
        review_notes=owner.review_notes,
        verification_status=owner.verification_status,
        status=owner.status,
        created_at=owner.created_at,
        updated_at=owner.updated_at,
    )
