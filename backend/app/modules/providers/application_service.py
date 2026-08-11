from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    IdentifierType,
    MembershipStatus,
    OrganizationStatus,
    OrganizationType,
    ProviderStatus,
    TenantStatus,
    TenantType,
    UserRole,
    UserStatus,
)
from app.modules.auth.model import User, UserIdentifier, VTSUserProfile
from app.modules.iam.service import (
    create_membership,
    create_tenant_and_root_organization,
    get_roles_by_codes,
)
from app.modules.providers.model import VTSProvider
from app.modules.providers.schema import ProviderRegister
from app.modules.providers.service import (
    generate_application_number,
    generate_provider_code,
    get_provider_for_user,
    replace_allowed_ips,
    replace_provider_documents,
)
from app.modules.settings.service import auto_approve_provider


class ProviderOwnershipError(ValueError):
    pass


async def get_user_contact_identifiers(
    session: AsyncSession,
    *,
    user: User,
) -> tuple[str, str]:
    identifiers = list(
        await session.scalars(
            select(UserIdentifier).where(
                UserIdentifier.user_id == user.id,
                UserIdentifier.disabled_at.is_(None),
                UserIdentifier.identifier_type.in_([IdentifierType.EMAIL, IdentifierType.MOBILE]),
            )
        )
    )
    email = next(
        (
            item.normalized_value
            for item in identifiers
            if item.identifier_type == IdentifierType.EMAIL
        ),
        None,
    )
    mobile = next(
        (
            item.normalized_value
            for item in identifiers
            if item.identifier_type == IdentifierType.MOBILE
        ),
        None,
    )
    if email is None or mobile is None:
        raise ProviderOwnershipError(
            "The provider owner user must have both email and mobile identifiers"
        )
    return email, mobile


async def create_provider_for_user(
    session: AsyncSession,
    *,
    payload: ProviderRegister,
    primary_admin: User,
    approved_by_user_id: int | None,
) -> VTSProvider:
    if primary_admin.status != UserStatus.ACTIVE or primary_admin.deleted_at is not None:
        raise ProviderOwnershipError("The selected provider owner user is not active")

    existing_for_user = await get_provider_for_user(session, primary_admin.id)
    if existing_for_user is not None:
        raise ProviderOwnershipError("This user already owns a VTS provider application")

    duplicate = await session.scalar(
        select(VTSProvider).where(
            or_(
                func.lower(VTSProvider.name) == payload.legal_name.strip().lower(),
                VTSProvider.license_number == payload.btrc_license_number,
                VTSProvider.trade_license_number == payload.trade_license_number,
            )
        )
    )
    if duplicate is not None:
        raise ProviderOwnershipError("A VTS application already exists for this company or licence")

    email, mobile = await get_user_contact_identifiers(session, user=primary_admin)
    now = datetime.now(UTC)
    tenant, organization = await create_tenant_and_root_organization(
        session,
        name=payload.legal_name,
        tenant_type=TenantType.VTS_PROVIDER,
        organization_type=OrganizationType.VTS_PROVIDER,
        registration_number=payload.company_registration_number,
    )
    tenant.status = TenantStatus.PENDING
    organization.status = OrganizationStatus.PENDING

    roles = await get_roles_by_codes(session, [UserRole.VTS_ADMIN.value])
    await create_membership(
        session,
        user_id=primary_admin.id,
        tenant=tenant,
        organization=organization,
        roles=roles,
        approved_by_id=approved_by_user_id,
        designation="Primary VTS Administrator",
        is_primary=True,
        status=MembershipStatus.ACTIVE,
    )

    profile = await session.scalar(
        select(VTSUserProfile).where(VTSUserProfile.user_id == primary_admin.id)
    )
    if profile is None:
        session.add(
            VTSUserProfile(
                user_id=primary_admin.id,
                designation="Primary VTS Administrator",
                is_technical_contact=(email == payload.technical_contact_email),
            )
        )
    else:
        profile.designation = "Primary VTS Administrator"
        profile.is_technical_contact = email == payload.technical_contact_email

    provider = VTSProvider(
        tenant_id=tenant.id,
        root_organization_id=organization.id,
        primary_admin_user_id=primary_admin.id,
        application_number=generate_application_number(),
        code=generate_provider_code(),
        name=payload.legal_name.strip(),
        trade_name=payload.trade_name,
        company_type=payload.company_type,
        incorporation_date=payload.incorporation_date,
        license_number=payload.btrc_license_number,
        btrc_license_issue_date=payload.btrc_license_issue_date,
        btrc_license_expiry_date=payload.btrc_license_expiry_date,
        trade_license_number=payload.trade_license_number,
        trade_license_expiry_date=payload.trade_license_expiry_date,
        company_registration_number=payload.company_registration_number,
        tin_number=payload.tin_number,
        bin_number=payload.bin_number,
        registered_address=payload.registered_address,
        district=payload.district,
        website_url=payload.website_url,
        authorized_representative_name=payload.authorized_representative_name,
        authorized_representative_nid=payload.authorized_representative_nid,
        authorized_representative_designation=payload.authorized_representative_designation,
        authorized_representative_mobile=payload.authorized_representative_mobile,
        authorized_representative_email=payload.authorized_representative_email,
        contact_person=primary_admin.display_name,
        phone=mobile,
        email=email,
        technical_contact_name=payload.technical_contact_name,
        technical_contact_phone=payload.technical_contact_mobile,
        technical_contact_email=payload.technical_contact_email,
        operations_contact_name=payload.operations_contact_name,
        operations_contact_phone=payload.operations_contact_phone,
        operations_contact_email=payload.operations_contact_email,
        support_contact_name=payload.support_contact_name,
        support_contact_phone=payload.support_contact_phone,
        support_contact_email=payload.support_contact_email,
        emergency_contact_name=payload.emergency_contact_name,
        emergency_contact_phone=payload.emergency_contact_phone,
        emergency_contact_email=payload.emergency_contact_email,
        service_coverage=payload.service_coverage,
        supported_protocols=payload.supported_protocols,
        supported_device_brands=payload.supported_device_brands,
        api_base_url=payload.api_base_url,
        estimated_vehicle_count=payload.estimated_vehicle_count,
        current_platform_name=payload.current_platform_name,
        data_submission_interval_seconds=payload.data_submission_interval_seconds,
        integration_status=payload.integration_status,
        declaration_accepted=payload.declaration_accepted,
        declaration_accepted_at=now,
        submitted_at=now,
        status=ProviderStatus.PENDING,
    )
    session.add(provider)
    await session.flush()
    await replace_provider_documents(
        session,
        provider_id=provider.id,
        documents=payload.documents,
    )
    await replace_allowed_ips(
        session,
        provider_id=provider.id,
        ip_addresses=payload.allowed_server_ips,
    )
    await auto_approve_provider(session, provider)
    return provider
