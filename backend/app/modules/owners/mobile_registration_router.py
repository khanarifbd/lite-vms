import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    IdentifierType,
    MembershipStatus,
    OrganizationStatus,
    OrganizationType,
    OwnerType,
    OwnerVerificationStatus,
    ProviderStatus,
    TenantStatus,
    TenantType,
    UserRole,
    UserStatus,
)
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User, UserIdentifier, UserSecurity
from app.modules.auth.schema import normalize_mobile
from app.modules.auth.security import hash_password
from app.modules.auth.service import get_identifier, mask_email, mask_mobile, mask_username
from app.modules.iam.service import create_membership, create_tenant_and_root_organization, get_roles_by_codes
from app.modules.owners.enums import OwnerClaimStatus, OwnerProviderLinkStatus
from app.modules.owners.mobile_registration_schema import (
    MobileOwnerLookupRequest,
    MobileOwnerLookupResponse,
    ProviderMobileOwnerRegister,
    ProviderMobileOwnerRegistrationResult,
)
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import (
    build_link_read,
    build_owner_read,
    create_or_activate_provider_owner_link,
    generate_owner_application_number,
    generate_owner_code,
    get_provider_owner_link,
    replace_owner_documents,
)
from app.modules.providers.service import get_provider_for_user

router = APIRouter(prefix="/owners", tags=["Mobile-first Vehicle Owner Registration"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def get_owner_by_mobile(session: AsyncSession, mobile: str) -> VehicleOwner | None:
    normalized = normalize_mobile(mobile)
    if normalized is None:
        return None
    return await session.scalar(
        select(VehicleOwner).where(
            or_(
                VehicleOwner.phone == normalized,
                VehicleOwner.nid_or_registration == normalized,
            )
        )
    )


async def create_mobile_primary_owner_user(
    session: AsyncSession,
    *,
    owner: VehicleOwner,
    payload: ProviderMobileOwnerRegister,
    actor_user_id: int,
) -> User:
    if owner.tenant_id is None or owner.root_organization_id is None:
        raise ValueError("Vehicle-owner identity scope is missing")

    existing_mobile = await get_identifier(
        session,
        identifier_type=IdentifierType.MOBILE,
        normalized_value=payload.mobile,
    )
    if existing_mobile is not None:
        raise ValueError("Mobile already registered")
    if payload.email:
        existing_email = await get_identifier(
            session,
            identifier_type=IdentifierType.EMAIL,
            normalized_value=payload.email,
        )
        if existing_email is not None:
            raise ValueError("Email already registered")
    if payload.login_username:
        existing_username = await get_identifier(
            session,
            identifier_type=IdentifierType.USERNAME,
            normalized_value=payload.login_username,
        )
        if existing_username is not None:
            raise ValueError("Username already registered")

    user = User(
        display_name=payload.contact_name.strip(),
        status=UserStatus.ACTIVE,
        created_by_id=actor_user_id,
        updated_by_id=actor_user_id,
    )
    session.add(user)
    await session.flush()

    session.add(
        UserIdentifier(
            user_id=user.id,
            identifier_type=IdentifierType.MOBILE,
            normalized_value=payload.mobile,
            masked_value=mask_mobile(payload.mobile),
            is_primary=True,
            is_verified=False,
        )
    )
    if payload.email:
        session.add(
            UserIdentifier(
                user_id=user.id,
                identifier_type=IdentifierType.EMAIL,
                normalized_value=payload.email,
                masked_value=mask_email(payload.email),
                is_primary=False,
                is_verified=False,
            )
        )
    if payload.login_username:
        session.add(
            UserIdentifier(
                user_id=user.id,
                identifier_type=IdentifierType.USERNAME,
                normalized_value=payload.login_username,
                masked_value=mask_username(payload.login_username),
                is_primary=False,
                is_verified=True,
                verified_at=datetime.now(UTC),
                verification_method="assigned_by_vts_provider",
            )
        )

    password = payload.temporary_password or secrets.token_urlsafe(32)
    session.add(
        UserSecurity(
            user_id=user.id,
            hashed_password=hash_password(password),
            password_changed_at=datetime.now(UTC),
            must_change_password=True,
            token_version=1,
        )
    )

    roles = await get_roles_by_codes(session, [UserRole.VEHICLE_OWNER.value])
    from app.modules.iam.model import Organization, Tenant

    tenant = await session.get(Tenant, owner.tenant_id)
    organization = await session.get(Organization, owner.root_organization_id)
    if tenant is None or organization is None:
        raise ValueError("Vehicle-owner identity scope is missing")
    await create_membership(
        session,
        user_id=user.id,
        tenant=tenant,
        organization=organization,
        roles=roles,
        approved_by_id=actor_user_id,
        designation=(
            "Primary Fleet Administrator"
            if payload.owner_type == OwnerType.COMPANY
            else "Vehicle Owner"
        ),
        is_primary=True,
        status=MembershipStatus.ACTIVE,
    )
    owner.primary_admin_user_id = user.id
    owner.claim_status = OwnerClaimStatus.PENDING_CLAIM
    return user


@router.post("/mobile-lookup", response_model=MobileOwnerLookupResponse)
async def lookup_owner_by_mobile(
    payload: MobileOwnerLookupRequest,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MobileOwnerLookupResponse:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None or provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Approved VTS provider required")

    owner = await get_owner_by_mobile(session, payload.mobile)
    if owner is None:
        return MobileOwnerLookupResponse(
            exists=False,
            mobile=payload.mobile,
            next_action="complete_owner_registration",
        )
    if owner.owner_type != payload.owner_type:
        raise HTTPException(
            status_code=409,
            detail="This mobile number is registered under a different owner type",
        )
    link = await get_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
    )
    return MobileOwnerLookupResponse(
        exists=True,
        owner_id=owner.id,
        owner_name=owner.name,
        mobile=payload.mobile,
        account_exists=owner.primary_admin_user_id is not None,
        current_provider_link_status=link.status.value if link else None,
        next_action=(
            "already_linked"
            if link
            and link.status
            in {
                OwnerProviderLinkStatus.ACTIVE,
                OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL,
                OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL,
            }
            else "auto_link_on_submit"
        ),
    )


@router.post(
    "/provider-mobile-register",
    response_model=ProviderMobileOwnerRegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
async def provider_mobile_register_owner(
    payload: ProviderMobileOwnerRegister,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderMobileOwnerRegistrationResult:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None or provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Approved VTS provider required")

    owner = await get_owner_by_mobile(session, payload.mobile)
    already_registered = owner is not None
    try:
        if owner is None:
            organization_type = (
                OrganizationType.INDIVIDUAL_VEHICLE_OWNER
                if payload.owner_type == OwnerType.INDIVIDUAL
                else OrganizationType.VEHICLE_OWNER_COMPANY
            )
            tenant, organization = await create_tenant_and_root_organization(
                session,
                name=payload.owner_name,
                tenant_type=TenantType.VEHICLE_OWNER,
                organization_type=organization_type,
                registration_number=(
                    payload.company_registration_number
                    if payload.owner_type == OwnerType.COMPANY
                    else payload.mobile
                ),
            )
            tenant.status = TenantStatus.PENDING
            organization.status = OrganizationStatus.PENDING
            owner = VehicleOwner(
                tenant_id=tenant.id,
                root_organization_id=organization.id,
                application_number=generate_owner_application_number(),
                owner_code=generate_owner_code(),
                owner_type=payload.owner_type,
                claim_status=OwnerClaimStatus.PENDING_CLAIM,
                name=payload.owner_name.strip(),
                nid_or_registration=payload.mobile,
                phone=payload.mobile,
                email=payload.email,
                address=payload.registered_address,
                district=payload.district,
                trade_license_number=payload.trade_license_number,
                tin_number=payload.tin_number,
                bin_number=payload.bin_number,
                website_url=payload.website_url,
                company_type=payload.company_type,
                incorporation_date=payload.incorporation_date,
                authorized_person_name=payload.authorized_person_name,
                authorized_person_designation=payload.authorized_person_designation,
                authorized_person_mobile=payload.authorized_person_mobile,
                authorized_person_email=payload.authorized_person_email,
                date_of_birth=payload.date_of_birth,
                father_name=payload.father_name,
                mother_name=payload.mother_name,
                gender=payload.gender,
                created_by_provider_id=provider.id,
                declaration_accepted=True,
                declaration_accepted_at=datetime.now(UTC),
                submitted_at=datetime.now(UTC),
                verification_status=OwnerVerificationStatus.PENDING,
            )
            session.add(owner)
            await session.flush()
            await create_mobile_primary_owner_user(
                session,
                owner=owner,
                payload=payload,
                actor_user_id=actor.id,
            )
            await replace_owner_documents(
                session,
                owner_id=owner.id,
                documents=payload.documents,
            )
        elif owner.owner_type != payload.owner_type:
            raise HTTPException(
                status_code=409,
                detail="This mobile number is registered under a different owner type",
            )

        link, _ = await create_or_activate_provider_owner_link(
            session,
            provider_id=provider.id,
            owner_id=owner.id,
            requested_by_user_id=actor.id,
        )
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action=(
                "vehicle_owner.mobile_registered_by_provider"
                if not already_registered
                else "vehicle_owner.mobile_link_activated_by_provider"
            ),
            resource_type="vehicle_owner",
            resource_public_id=owner.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "owner_type": owner.owner_type.value,
                "mobile_primary_login": True,
                "email_added": bool(payload.email),
                "username_added": bool(payload.login_username),
                "provider_link_status": OwnerProviderLinkStatus.ACTIVE.value,
            },
        )
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    await session.refresh(owner)
    await session.refresh(link)
    return ProviderMobileOwnerRegistrationResult(
        owner=await build_owner_read(session, owner),
        link=await build_link_read(session, link),
        already_registered=already_registered,
        primary_login_mobile=payload.mobile,
        email_added=bool(payload.email and not already_registered),
        username_added=bool(payload.login_username and not already_registered),
        must_change_password=not already_registered,
        message=(
            "Existing owner found and linked to this provider"
            if already_registered
            else "Owner registered and linked to this provider"
        ),
    )
