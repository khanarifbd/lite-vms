import re
import secrets
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import IdentifierType, MembershipStatus, UserRole, UserStatus
from app.modules.assignments.model import DriverAssignment
from app.modules.auth.model import User, UserIdentifier
from app.modules.auth.service import create_user_identity, get_security
from app.modules.drivers.enums import (
    DriverClaimStatus,
    DriverLinkSource,
    DriverLinkStatus,
    DriverVerificationStatus,
)
from app.modules.drivers.model import (
    Driver,
    DriverDocument,
    DriverLicence,
    VehicleOwnerDriverLink,
    VTSProviderDriverLink,
)
from app.modules.drivers.schema import (
    DriverAccountRead,
    DriverDetails,
    DriverDocumentCreate,
    DriverDocumentRead,
    DriverLicenceRead,
    DriverLinkRead,
    DriverLinkSummary,
    DriverRead,
)
from app.modules.iam.service import (
    create_membership,
    get_or_create_system_scope,
    get_roles_by_codes,
)
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.tracking.model import VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle


def normalize_driver_nid(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]", "", value).upper()
    if len(normalized) < 10:
        raise ValueError("A valid NID reference is required")
    return normalized


def mask_driver_nid(value: str) -> str:
    return value


def generate_driver_code() -> str:
    return f"DRIVER-{secrets.token_hex(4).upper()}"


async def get_driver_by_nid(session: AsyncSession, nid_reference: str) -> Driver | None:
    normalized = normalize_driver_nid(nid_reference)
    return await session.scalar(select(Driver).where(Driver.nid_reference == normalized))


async def get_driver_for_user(session: AsyncSession, user_id: int) -> Driver | None:
    return await session.scalar(select(Driver).where(Driver.user_id == user_id))


async def get_driver_username(session: AsyncSession, driver: Driver) -> str | None:
    return await session.scalar(
        select(UserIdentifier.normalized_value).where(
            UserIdentifier.user_id == driver.user_id,
            UserIdentifier.identifier_type == IdentifierType.USERNAME,
            UserIdentifier.disabled_at.is_(None),
        )
    )


async def create_driver_account(
    session: AsyncSession,
    *,
    email: str,
    mobile: str,
    username: str,
    display_name: str,
    password: str,
    created_by_user_id: int | None,
    must_change_password: bool,
) -> User:
    user = await create_user_identity(
        session,
        email=email,
        mobile=mobile,
        username=username,
        display_name=display_name,
        password=password,
        status=UserStatus.ACTIVE,
        created_by_id=created_by_user_id,
        must_change_password=must_change_password,
    )
    tenant, organization = await get_or_create_system_scope(session)
    roles = await get_roles_by_codes(session, [UserRole.DRIVER.value])
    await create_membership(
        session,
        user_id=user.id,
        tenant=tenant,
        organization=organization,
        roles=roles,
        approved_by_id=created_by_user_id,
        designation="Registered Driver",
        is_primary=True,
        status=MembershipStatus.ACTIVE,
    )
    return user


async def replace_driver_documents(
    session: AsyncSession,
    *,
    driver_id: uuid.UUID,
    documents: list[DriverDocumentCreate],
) -> None:
    for document in documents:
        previous = await session.scalar(
            select(DriverDocument)
            .where(
                DriverDocument.driver_id == driver_id,
                DriverDocument.document_type == document.document_type,
                DriverDocument.is_active.is_(True),
            )
            .order_by(DriverDocument.version.desc())
        )
        version = previous.version + 1 if previous else 1
        new_document = DriverDocument(
            driver_id=driver_id,
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


async def create_driver_record(
    session: AsyncSession,
    *,
    payload: DriverDetails,
    user: User,
    claim_status: DriverClaimStatus,
    created_by_provider_id: uuid.UUID | None = None,
    created_by_owner_id: uuid.UUID | None = None,
) -> Driver:
    driver = Driver(
        user_id=user.id,
        driver_code=generate_driver_code(),
        nid_reference=normalize_driver_nid(payload.nid_reference),
        full_name=payload.full_name.strip(),
        date_of_birth=payload.date_of_birth,
        father_name=payload.father_name,
        mother_name=payload.mother_name,
        gender=payload.gender,
        blood_group=payload.blood_group,
        phone=payload.mobile,
        email=payload.email,
        emergency_contact_name=payload.emergency_contact_name,
        emergency_contact_phone=payload.emergency_contact_phone,
        present_address=payload.present_address,
        permanent_address=payload.permanent_address,
        district=payload.district,
        photo_url=payload.photo_url,
        employment_type=payload.employment_type,
        shift_information=payload.shift_information,
        medical_fitness_expiry_date=payload.medical_fitness_expiry_date,
        claim_status=claim_status,
        declaration_accepted=payload.declaration_accepted,
        submitted_at=datetime.now(UTC),
        created_by_provider_id=created_by_provider_id,
        created_by_owner_id=created_by_owner_id,
    )
    session.add(driver)
    await session.flush()
    session.add(
        DriverLicence(
            driver_id=driver.id,
            licence_number=payload.licence_number.strip().upper(),
            licence_type=payload.licence_type,
            vehicle_classes=payload.vehicle_classes,
            first_issue_date=payload.first_issue_date,
            issue_date=payload.issue_date,
            expiry_date=payload.licence_expiry_date,
        )
    )
    await replace_driver_documents(session, driver_id=driver.id, documents=payload.documents)
    await session.flush()
    return driver


async def create_or_reopen_provider_driver_link(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    driver_id: uuid.UUID,
    requested_by: DriverLinkSource,
    requested_by_user_id: int,
) -> tuple[VTSProviderDriverLink, bool]:
    link = await session.scalar(
        select(VTSProviderDriverLink).where(
            VTSProviderDriverLink.provider_id == provider_id,
            VTSProviderDriverLink.driver_id == driver_id,
        )
    )
    target_status = (
        DriverLinkStatus.PENDING_DRIVER_APPROVAL
        if requested_by == DriverLinkSource.VTS_PROVIDER
        else DriverLinkStatus.PENDING_ORGANIZATION_APPROVAL
    )
    if link is None:
        link = VTSProviderDriverLink(
            provider_id=provider_id,
            driver_id=driver_id,
            status=target_status,
            requested_by=requested_by,
            requested_by_user_id=requested_by_user_id,
        )
        session.add(link)
        await session.flush()
        return link, True
    if link.status in {
        DriverLinkStatus.ACTIVE,
        DriverLinkStatus.PENDING_DRIVER_APPROVAL,
        DriverLinkStatus.PENDING_ORGANIZATION_APPROVAL,
        DriverLinkStatus.SUSPENDED,
    }:
        return link, False
    link.status = target_status
    link.requested_by = requested_by
    link.requested_by_user_id = requested_by_user_id
    link.requested_at = datetime.now(UTC)
    link.responded_by_user_id = None
    link.responded_at = None
    link.ended_at = None
    link.reason = None
    await session.flush()
    return link, True


async def create_or_reopen_owner_driver_link(
    session: AsyncSession,
    *,
    owner_id: uuid.UUID,
    driver_id: uuid.UUID,
    requested_by: DriverLinkSource,
    requested_by_user_id: int,
) -> tuple[VehicleOwnerDriverLink, bool]:
    link = await session.scalar(
        select(VehicleOwnerDriverLink).where(
            VehicleOwnerDriverLink.owner_id == owner_id,
            VehicleOwnerDriverLink.driver_id == driver_id,
        )
    )
    target_status = (
        DriverLinkStatus.PENDING_DRIVER_APPROVAL
        if requested_by == DriverLinkSource.VEHICLE_OWNER
        else DriverLinkStatus.PENDING_ORGANIZATION_APPROVAL
    )
    if link is None:
        link = VehicleOwnerDriverLink(
            owner_id=owner_id,
            driver_id=driver_id,
            status=target_status,
            requested_by=requested_by,
            requested_by_user_id=requested_by_user_id,
        )
        session.add(link)
        await session.flush()
        return link, True
    if link.status in {
        DriverLinkStatus.ACTIVE,
        DriverLinkStatus.PENDING_DRIVER_APPROVAL,
        DriverLinkStatus.PENDING_ORGANIZATION_APPROVAL,
        DriverLinkStatus.SUSPENDED,
    }:
        return link, False
    link.status = target_status
    link.requested_by = requested_by
    link.requested_by_user_id = requested_by_user_id
    link.requested_at = datetime.now(UTC)
    link.responded_by_user_id = None
    link.responded_at = None
    link.ended_at = None
    link.reason = None
    await session.flush()
    return link, True


async def provider_has_active_driver_link(
    session: AsyncSession, *, provider_id: uuid.UUID, driver_id: uuid.UUID
) -> bool:
    link_id = await session.scalar(
        select(VTSProviderDriverLink.id).where(
            VTSProviderDriverLink.provider_id == provider_id,
            VTSProviderDriverLink.driver_id == driver_id,
            VTSProviderDriverLink.status == DriverLinkStatus.ACTIVE,
        )
    )
    return link_id is not None


async def owner_has_active_driver_link(
    session: AsyncSession, *, owner_id: uuid.UUID, driver_id: uuid.UUID
) -> bool:
    link_id = await session.scalar(
        select(VehicleOwnerDriverLink.id).where(
            VehicleOwnerDriverLink.owner_id == owner_id,
            VehicleOwnerDriverLink.driver_id == driver_id,
            VehicleOwnerDriverLink.status == DriverLinkStatus.ACTIVE,
        )
    )
    return link_id is not None


async def build_driver_link_summaries(
    session: AsyncSession, driver_id: uuid.UUID
) -> list[DriverLinkSummary]:
    summaries: list[DriverLinkSummary] = []
    provider_rows = (
        await session.execute(
            select(VTSProviderDriverLink, VTSProvider)
            .join(VTSProvider, VTSProvider.id == VTSProviderDriverLink.provider_id)
            .where(VTSProviderDriverLink.driver_id == driver_id)
        )
    ).all()
    for link, provider in provider_rows:
        summaries.append(
            DriverLinkSummary(
                link_id=link.id,
                organization_type=DriverLinkSource.VTS_PROVIDER,
                organization_id=provider.id,
                organization_name=provider.name,
                status=link.status,
            )
        )
    owner_rows = (
        await session.execute(
            select(VehicleOwnerDriverLink, VehicleOwner)
            .join(VehicleOwner, VehicleOwner.id == VehicleOwnerDriverLink.owner_id)
            .where(VehicleOwnerDriverLink.driver_id == driver_id)
        )
    ).all()
    for link, owner in owner_rows:
        summaries.append(
            DriverLinkSummary(
                link_id=link.id,
                organization_type=DriverLinkSource.VEHICLE_OWNER,
                organization_id=owner.id,
                organization_name=owner.name,
                status=link.status,
            )
        )
    return sorted(
        summaries, key=lambda item: (item.organization_type.value, item.organization_name)
    )


async def build_driver_read(session: AsyncSession, driver: Driver) -> DriverRead:
    user = await session.get(User, driver.user_id)
    licence = await session.scalar(
        select(DriverLicence).where(DriverLicence.driver_id == driver.id)
    )
    security = await get_security(session, driver.user_id)
    if user is None or licence is None or security is None:
        raise RuntimeError("Driver account or licence relationship is incomplete")
    username = await get_driver_username(session, driver)
    documents = list(
        await session.scalars(
            select(DriverDocument)
            .where(
                DriverDocument.driver_id == driver.id,
                DriverDocument.is_active.is_(True),
            )
            .order_by(DriverDocument.document_type, DriverDocument.version.desc())
        )
    )
    assignment = await session.scalar(
        select(DriverAssignment)
        .where(
            DriverAssignment.driver_id == driver.id,
            DriverAssignment.status == "active",
        )
        .order_by(DriverAssignment.valid_from.desc())
    )
    vehicle = await session.get(Vehicle, assignment.vehicle_id) if assignment else None
    owner = await session.get(VehicleOwner, vehicle.owner_id) if vehicle else None
    device_assignment = (
        await session.scalar(
            select(VehicleDeviceAssignment)
            .where(
                VehicleDeviceAssignment.vehicle_id == vehicle.id,
                VehicleDeviceAssignment.status == "active",
                VehicleDeviceAssignment.is_primary.is_(True),
            )
            .order_by(VehicleDeviceAssignment.valid_from.desc())
        )
        if vehicle
        else None
    )
    provider = (
        await session.get(VTSProvider, device_assignment.provider_id)
        if device_assignment and device_assignment.provider_id
        else None
    )

    return DriverRead(
        id=driver.id,
        driver_code=driver.driver_code,
        full_name=driver.full_name,
        nid_reference=driver.nid_reference,
        date_of_birth=driver.date_of_birth,
        father_name=driver.father_name,
        mother_name=driver.mother_name,
        gender=driver.gender,
        blood_group=driver.blood_group,
        mobile=driver.phone,
        email=driver.email,
        emergency_contact_name=driver.emergency_contact_name,
        emergency_contact_phone=driver.emergency_contact_phone,
        present_address=driver.present_address,
        permanent_address=driver.permanent_address,
        district=driver.district,
        photo_url=driver.photo_url,
        employment_type=driver.employment_type,
        shift_information=driver.shift_information,
        medical_fitness_expiry_date=driver.medical_fitness_expiry_date,
        suspension_reason=driver.suspension_reason,
        current_vehicle_id=vehicle.id if vehicle else None,
        current_vehicle_registration=(
            vehicle.registration_number_display or vehicle.registration_number
            if vehicle
            else None
        ),
        current_assignment_id=assignment.id if assignment else None,
        current_assignment_is_on_duty=assignment.is_on_duty if assignment else False,
        current_assignment_started_at=assignment.valid_from if assignment else None,
        current_owner_name=owner.name if owner else None,
        current_provider_name=provider.name if provider else None,
        claim_status=driver.claim_status,
        verification_status=driver.verification_status,
        behaviour_score=driver.behaviour_score,
        licence=DriverLicenceRead(
            id=licence.id,
            licence_number=licence.licence_number,
            licence_type=licence.licence_type,
            vehicle_classes=licence.vehicle_classes,
            first_issue_date=licence.first_issue_date,
            issue_date=licence.issue_date,
            expiry_date=licence.expiry_date,
            issuing_authority=licence.issuing_authority,
            verification_status=licence.verification_status,
            verified_at=licence.verified_at,
            review_notes=licence.review_notes,
        ),
        documents=[
            DriverDocumentRead(
                id=document.id,
                document_type=document.document_type,
                document_reference=document.document_reference,
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
        links=await build_driver_link_summaries(session, driver.id),
        account=DriverAccountRead(
            user_public_id=user.public_id,
            display_name=user.display_name,
            username=username,
            email=driver.email,
            mobile=driver.phone,
            must_change_password=security.must_change_password,
        ),
        status=driver.status,
        submitted_at=driver.submitted_at,
        reviewed_at=driver.reviewed_at,
        review_notes=driver.review_notes,
        application_locked=driver.verification_status
        not in {
            DriverVerificationStatus.PENDING,
            DriverVerificationStatus.CHANGES_REQUESTED,
        },
        profile_change_status=driver.profile_change_status,
        profile_change_submitted_at=driver.profile_change_submitted_at,
        profile_change_reviewed_at=driver.profile_change_reviewed_at,
        profile_change_review_notes=driver.profile_change_review_notes,
        created_at=driver.created_at,
        updated_at=driver.updated_at,
    )


async def build_provider_link_read(
    session: AsyncSession, link: VTSProviderDriverLink
) -> DriverLinkRead:
    driver = await session.get(Driver, link.driver_id)
    provider = await session.get(VTSProvider, link.provider_id)
    if driver is None or provider is None:
        raise RuntimeError("Provider-driver link is incomplete")
    return DriverLinkRead(
        id=link.id,
        driver_id=driver.id,
        driver_name=driver.full_name,
        organization_type=DriverLinkSource.VTS_PROVIDER,
        organization_id=provider.id,
        organization_name=provider.name,
        status=link.status,
        requested_by=link.requested_by,
        requested_at=link.requested_at,
        responded_at=link.responded_at,
        ended_at=link.ended_at,
        reason=link.reason,
    )


async def build_owner_link_read(
    session: AsyncSession, link: VehicleOwnerDriverLink
) -> DriverLinkRead:
    driver = await session.get(Driver, link.driver_id)
    owner = await session.get(VehicleOwner, link.owner_id)
    if driver is None or owner is None:
        raise RuntimeError("Owner-driver link is incomplete")
    return DriverLinkRead(
        id=link.id,
        driver_id=driver.id,
        driver_name=driver.full_name,
        organization_type=DriverLinkSource.VEHICLE_OWNER,
        organization_id=owner.id,
        organization_name=owner.name,
        status=link.status,
        requested_by=link.requested_by,
        requested_at=link.requested_at,
        responded_at=link.responded_at,
        ended_at=link.ended_at,
        reason=link.reason,
    )


def licence_is_current(expiry_date: date) -> bool:
    return expiry_date >= date.today()
