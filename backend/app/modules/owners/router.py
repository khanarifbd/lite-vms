import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    IdentityAssuranceLevel,
    IdentityVerificationStatus,
    MembershipStatus,
    OrganizationStatus,
    OrganizationType,
    OwnerDocumentStatus,
    OwnerReviewDecision,
    OwnerType,
    OwnerVerificationStatus,
    ProviderStatus,
    TenantStatus,
    TenantType,
    TrackingAssignmentStatus,
    UserRole,
    UserStatus,
)
from app.core.config import settings
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User
from app.modules.auth.security import verify_password
from app.modules.auth.service import (
    change_password,
    create_user_identity,
    get_security,
    get_user_by_login_identifier,
)
from app.modules.iam.model import Organization, Tenant
from app.modules.iam.service import (
    create_membership,
    create_tenant_and_root_organization,
    get_roles_by_codes,
)
from app.modules.owners.enums import (
    OwnerClaimStatus,
    OwnerProviderLinkDecision,
    OwnerProviderLinkStatus,
    OwnerProviderRequestSource,
)
from app.modules.owners.model import (
    VehicleOwner,
    VehicleOwnerDocument,
    VTSProviderOwnerLink,
)
from app.modules.owners.schema import (
    OwnerAccountResetResult,
    OwnerApplicationRead,
    OwnerApplicationUpdate,
    OwnerLookupRequest,
    OwnerLookupResponse,
    OwnerPage,
    OwnerProviderLinkPage,
    OwnerProviderLinkRead,
    OwnerProviderLinkRequest,
    OwnerProviderLinkResponse,
    OwnerProviderUnlink,
    OwnerRegister,
    OwnerRegistrationResult,
    OwnerReview,
    OwnerTemporaryPasswordReset,
    ProviderOwnerRegister,
    ProviderOwnerRegistrationResult,
)
from app.modules.owners.service import (
    build_link_read,
    build_owner_read,
    build_provider_link_summaries,
    create_or_reopen_provider_owner_link,
    generate_owner_application_number,
    generate_owner_code,
    get_owner_by_id,
    get_owner_by_identity,
    get_owner_for_user,
    get_owner_username,
    get_provider_owner_link,
    has_active_provider_owner_link,
    normalize_owner_identity,
    provider_can_access_owner,
    replace_owner_documents,
    user_can_access_owner,
)
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user
from app.modules.tracking.model import VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/owners", tags=["Global Vehicle Owner Registry"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def role_codes(user: User) -> set[str]:
    return set(getattr(user, "_role_codes", set()))


def can_manage_all_owners(user: User) -> bool:
    return bool(
        role_codes(user).intersection({UserRole.SUPER_ADMIN.value, UserRole.POLICE_ADMIN.value})
    )


async def actor_provider(session: AsyncSession, actor: User) -> VTSProvider | None:
    if UserRole.VTS_ADMIN.value not in role_codes(actor):
        return None
    return await get_provider_for_user(session, actor.id)


async def ensure_owner_access(
    session: AsyncSession,
    *,
    actor: User,
    owner: VehicleOwner,
) -> None:
    if can_manage_all_owners(actor):
        return
    if await user_can_access_owner(session, user_id=actor.id, owner=owner):
        return
    provider = await actor_provider(session, actor)
    if provider and await provider_can_access_owner(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
    ):
        return
    raise HTTPException(status_code=403, detail="You cannot access this vehicle owner")


async def attach_owner_account(
    session: AsyncSession,
    *,
    owner: VehicleOwner,
    email: str,
    mobile: str | None,
    display_name: str,
    password: str,
    owner_type: OwnerType,
    username: str | None = None,
    created_by_id: int | None = None,
    must_change_password: bool = False,
    claim_status: OwnerClaimStatus = OwnerClaimStatus.CLAIMED,
) -> User:
    if owner.tenant_id is None or owner.root_organization_id is None:
        raise ValueError("Vehicle-owner identity scope is missing")
    tenant = await session.get(Tenant, owner.tenant_id)
    organization = await session.get(Organization, owner.root_organization_id)
    if tenant is None or organization is None:
        raise ValueError("Vehicle-owner identity scope is missing")

    user = await create_user_identity(
        session,
        email=email,
        mobile=mobile,
        username=username,
        display_name=display_name,
        password=password,
        status=UserStatus.ACTIVE,
        created_by_id=created_by_id,
        must_change_password=must_change_password,
    )
    if owner.verification_status == OwnerVerificationStatus.APPROVED:
        user.identity_verification_status = IdentityVerificationStatus.VERIFIED
        user.identity_assurance_level = IdentityAssuranceLevel.SUBSTANTIAL

    roles = await get_roles_by_codes(session, [UserRole.VEHICLE_OWNER.value])
    await create_membership(
        session,
        user_id=user.id,
        tenant=tenant,
        organization=organization,
        roles=roles,
        approved_by_id=created_by_id,
        designation=(
            "Primary Fleet Administrator" if owner_type == OwnerType.COMPANY else "Vehicle Owner"
        ),
        is_primary=True,
        status=MembershipStatus.ACTIVE,
    )

    # VehicleOwner is the single authoritative owner profile. The legacy
    # auth.OwnerProfile table is intentionally no longer written.
    owner.primary_admin_user_id = user.id
    owner.claim_status = claim_status
    return user


def apply_owner_details(
    owner: VehicleOwner,
    *,
    payload: OwnerRegister | ProviderOwnerRegister,
    fallback_phone: str | None,
    fallback_email: str,
) -> None:
    owner.owner_type = payload.owner_type
    owner.name = payload.owner_name.strip()
    owner.phone = payload.phone or fallback_phone
    owner.email = payload.email or fallback_email
    owner.date_of_birth = payload.date_of_birth
    owner.father_name = payload.father_name
    owner.mother_name = payload.mother_name
    owner.gender = payload.gender
    owner.profile_photo_storage_key = payload.profile_photo_storage_key
    owner.present_address = payload.present_address
    owner.permanent_address = payload.permanent_address
    owner.division = payload.division
    owner.upazila = payload.upazila
    owner.postal_code = payload.postal_code
    owner.alternate_phone = payload.alternate_phone
    owner.company_type = payload.company_type
    owner.incorporation_date = payload.incorporation_date
    owner.authorized_person_name = payload.authorized_person_name
    owner.authorized_person_nid = payload.authorized_person_nid
    owner.authorized_person_designation = payload.authorized_person_designation
    owner.authorized_person_mobile = payload.authorized_person_mobile
    owner.authorized_person_email = payload.authorized_person_email
    owner.company_logo_storage_key = payload.company_logo_storage_key
    owner.head_office_address = payload.head_office_address
    owner.operating_address = payload.operating_address
    owner.trade_license_number = payload.trade_license_number
    owner.tin_number = payload.tin_number
    owner.bin_number = payload.bin_number
    owner.address = payload.registered_address
    owner.district = payload.district
    owner.website_url = payload.website_url
    owner.declaration_accepted = payload.declaration_accepted
    owner.declaration_accepted_at = datetime.now(UTC)


@router.post(
    "/register",
    response_model=OwnerRegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
async def register_vehicle_owner(
    payload: OwnerRegister,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerRegistrationResult:
    if not settings.allow_public_registration:
        raise HTTPException(status_code=403, detail="Public registration is disabled")

    identity_reference = normalize_owner_identity(payload.identity_or_registration_reference)
    owner = await get_owner_by_identity(session, identity_reference)
    if owner is not None:
        if owner.owner_type != payload.owner_type:
            raise HTTPException(
                status_code=409,
                detail="This identity reference is registered under a different owner type",
            )
        raise HTTPException(
            status_code=409,
            detail={
                "code": "owner_already_registered",
                "message": "This vehicle owner is already registered",
                "owner_id": str(owner.id),
                "owner_name": owner.name,
                "identity_or_registration_reference": owner.nid_or_registration,
                "phone": owner.phone,
                "username": await get_owner_username(session, owner),
                "next_action": (
                    "request_mobile_password_reset"
                    if owner.claim_status == OwnerClaimStatus.PENDING_CLAIM
                    else "login_or_forgot_password"
                ),
            },
        )

    organization_type = (
        OrganizationType.INDIVIDUAL_VEHICLE_OWNER
        if payload.owner_type == OwnerType.INDIVIDUAL
        else OrganizationType.VEHICLE_OWNER_COMPANY
    )
    try:
        tenant, organization = await create_tenant_and_root_organization(
            session,
            name=payload.owner_name,
            tenant_type=TenantType.VEHICLE_OWNER,
            organization_type=organization_type,
            registration_number=identity_reference,
        )
        tenant.status = TenantStatus.PENDING
        organization.status = OrganizationStatus.PENDING
        owner = VehicleOwner(
            tenant_id=tenant.id,
            root_organization_id=organization.id,
            application_number=generate_owner_application_number(),
            owner_code=generate_owner_code(),
            owner_type=payload.owner_type,
            claim_status=OwnerClaimStatus.CLAIMED,
            name=payload.owner_name.strip(),
            nid_or_registration=identity_reference,
            submitted_at=datetime.now(UTC),
            verification_status=OwnerVerificationStatus.PENDING,
        )
        apply_owner_details(
            owner,
            payload=payload,
            fallback_phone=payload.admin_mobile,
            fallback_email=payload.admin_email,
        )
        session.add(owner)
        await session.flush()
        user = await attach_owner_account(
            session,
            owner=owner,
            email=payload.admin_email,
            mobile=payload.admin_mobile,
            display_name=payload.admin_full_name,
            password=payload.password,
            owner_type=payload.owner_type,
        )
        await replace_owner_documents(
            session,
            owner_id=owner.id,
            documents=payload.documents,
        )
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=user.id,
            actor_organization_id=organization.id,
            action="vehicle_owner.self_registered",
            resource_type="vehicle_owner",
            resource_public_id=owner.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "owner_type": owner.owner_type.value,
                "claim_status": owner.claim_status.value,
            },
        )
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    await session.refresh(owner)
    return OwnerRegistrationResult(
        owner=await build_owner_read(session, owner),
        account_can_login=True,
        claimed_existing_record=False,
        message="Vehicle-owner registration submitted successfully",
    )


@router.post("/lookup", response_model=OwnerLookupResponse)
async def lookup_vehicle_owner(
    payload: OwnerLookupRequest,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerLookupResponse:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider application not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="VTS provider is not approved")

    owner = await get_owner_by_identity(
        session,
        payload.identity_or_registration_reference,
    )
    if owner is None:
        return OwnerLookupResponse(exists=False, next_action="complete_owner_registration")
    if owner.owner_type != payload.owner_type:
        raise HTTPException(
            status_code=409,
            detail="This identity reference is registered under a different owner type",
        )
    link = await get_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
    )
    return OwnerLookupResponse(
        exists=True,
        owner_id=owner.id,
        owner_name=owner.name,
        identity_or_registration_reference=owner.nid_or_registration,
        phone=owner.phone,
        username=await get_owner_username(session, owner),
        account_exists=owner.primary_admin_user_id is not None,
        claim_status=owner.claim_status,
        verification_status=owner.verification_status,
        current_provider_link_status=link.status if link else None,
        linked_providers=await build_provider_link_summaries(session, owner.id),
        next_action=(
            "already_linked"
            if link
            and link.status
            in {
                OwnerProviderLinkStatus.ACTIVE,
                OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL,
                OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL,
            }
            else "request_owner_link"
        ),
    )


@router.post(
    "/provider-register",
    response_model=ProviderOwnerRegistrationResult,
)
async def provider_register_vehicle_owner(
    payload: ProviderOwnerRegister,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderOwnerRegistrationResult:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider application not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="VTS provider is not approved")

    identity_reference = normalize_owner_identity(payload.identity_or_registration_reference)
    owner = await get_owner_by_identity(session, identity_reference)
    already_registered = owner is not None
    account_created = False

    try:
        if owner is None:
            if not payload.login_username:
                raise HTTPException(
                    status_code=422,
                    detail="login_username is required when the owner is not registered",
                )
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
                registration_number=identity_reference,
            )
            tenant.status = TenantStatus.PENDING
            organization.status = OrganizationStatus.PENDING
            owner = VehicleOwner(
                tenant_id=tenant.id,
                root_organization_id=organization.id,
                created_by_provider_id=provider.id,
                application_number=generate_owner_application_number(),
                owner_code=generate_owner_code(),
                owner_type=payload.owner_type,
                claim_status=OwnerClaimStatus.PENDING_CLAIM,
                name=payload.owner_name.strip(),
                nid_or_registration=identity_reference,
                submitted_at=datetime.now(UTC),
                verification_status=OwnerVerificationStatus.PENDING,
            )
            apply_owner_details(
                owner,
                payload=payload,
                fallback_phone=payload.contact_mobile,
                fallback_email=payload.contact_email,
            )
            session.add(owner)
            await session.flush()
            await attach_owner_account(
                session,
                owner=owner,
                email=payload.contact_email,
                mobile=payload.contact_mobile,
                username=payload.login_username,
                display_name=payload.contact_name,
                password=payload.temporary_password or secrets.token_urlsafe(32),
                owner_type=payload.owner_type,
                created_by_id=actor.id,
                must_change_password=True,
                claim_status=OwnerClaimStatus.PENDING_CLAIM,
            )
            account_created = True
            await replace_owner_documents(
                session,
                owner_id=owner.id,
                documents=payload.documents,
            )
        else:
            if owner.owner_type != payload.owner_type:
                raise HTTPException(
                    status_code=409,
                    detail="This identity reference is registered under a different owner type",
                )
            if owner.primary_admin_user_id is None:
                if not payload.login_username:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            "login_username is required to complete this legacy "
                            "provisional owner account"
                        ),
                    )
                await attach_owner_account(
                    session,
                    owner=owner,
                    email=payload.contact_email,
                    mobile=payload.contact_mobile,
                    username=payload.login_username,
                    display_name=payload.contact_name,
                    password=payload.temporary_password or secrets.token_urlsafe(32),
                    owner_type=payload.owner_type,
                    created_by_id=actor.id,
                    must_change_password=True,
                    claim_status=OwnerClaimStatus.PENDING_CLAIM,
                )
                owner.created_by_provider_id = owner.created_by_provider_id or provider.id
                account_created = True

        link, _ = await create_or_reopen_provider_owner_link(
            session,
            provider_id=provider.id,
            owner_id=owner.id,
            requested_by=OwnerProviderRequestSource.PROVIDER,
            requested_by_user_id=actor.id,
        )
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action="vehicle_owner.provider_link_requested",
            resource_type="vts_provider_owner_link",
            resource_public_id=link.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "owner_id": str(owner.id),
                "provider_id": str(provider.id),
                "link_status": link.status.value,
                "already_registered": already_registered,
                "account_created": account_created,
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
    username = await get_owner_username(session, owner)
    security = (
        await get_security(session, owner.primary_admin_user_id)
        if owner.primary_admin_user_id is not None
        else None
    )
    return ProviderOwnerRegistrationResult(
        owner=await build_owner_read(session, owner),
        link=await build_link_read(session, link),
        already_registered=already_registered,
        login_username=username if account_created else None,
        must_change_password=bool(security and security.must_change_password),
        message=(
            "Owner already exists; no duplicate account was created"
            if already_registered and not account_created
            else "Owner and temporary login account created successfully"
        ),
    )


@router.post(
    "/reset-temporary-password",
    response_model=OwnerAccountResetResult,
)
async def reset_owner_temporary_password(
    payload: OwnerTemporaryPasswordReset,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerAccountResetResult:
    owner = await get_owner_by_identity(session, payload.identity_or_registration_reference)
    if owner is None or owner.primary_admin_user_id is None:
        raise HTTPException(status_code=404, detail="Vehicle-owner account not found")

    found = await get_user_by_login_identifier(session, payload.username)
    if found is None or found[0].id != owner.primary_admin_user_id:
        raise HTTPException(status_code=400, detail="Owner username does not match")
    user, _ = found
    security = await get_security(session, user.id)
    if security is None:
        raise HTTPException(status_code=409, detail="Owner security record is missing")
    if not security.must_change_password:
        raise HTTPException(
            status_code=409,
            detail="The temporary password has already been replaced",
        )
    if not verify_password(payload.temporary_password, security.hashed_password):
        raise HTTPException(status_code=400, detail="Temporary password is incorrect")
    if verify_password(payload.new_password, security.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different")

    await change_password(
        session,
        user=user,
        new_password=payload.new_password,
        must_change_password=False,
    )
    owner.claim_status = OwnerClaimStatus.CLAIMED
    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=user.id,
        action="vehicle_owner.temporary_password_reset",
        resource_type="vehicle_owner",
        resource_public_id=owner.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={
            "claim_status": owner.claim_status.value,
            "must_change_password": False,
        },
    )
    await session.commit()
    return OwnerAccountResetResult(
        owner_id=owner.id,
        owner_name=owner.name,
        username=payload.username,
        phone=owner.phone,
        must_change_password=False,
        message="Temporary password replaced; the owner account is ready to use",
    )


@router.post(
    "/provider-links",
    response_model=OwnerProviderLinkRead,
    status_code=status.HTTP_201_CREATED,
)
async def owner_request_provider_link(
    payload: OwnerProviderLinkRequest,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerProviderLinkRead:
    owner = await get_owner_for_user(session, actor.id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    provider = await session.get(VTSProvider, payload.provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Selected VTS provider is not approved")
    link, _ = await create_or_reopen_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
        requested_by=OwnerProviderRequestSource.OWNER,
        requested_by_user_id=actor.id,
    )
    await session.commit()
    await session.refresh(link)
    return await build_link_read(session, link)


@router.get("/provider-links", response_model=OwnerProviderLinkPage)
async def list_provider_links(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    link_status: Annotated[OwnerProviderLinkStatus | None, Query(alias="status")] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> OwnerProviderLinkPage:
    query = select(VTSProviderOwnerLink)
    count_query = select(func.count(VTSProviderOwnerLink.id))
    if can_manage_all_owners(actor):
        pass
    elif UserRole.VEHICLE_OWNER.value in role_codes(actor):
        owner = await get_owner_for_user(session, actor.id)
        if owner is None:
            raise HTTPException(status_code=404, detail="Vehicle owner not found")
        query = query.where(VTSProviderOwnerLink.owner_id == owner.id)
        count_query = count_query.where(VTSProviderOwnerLink.owner_id == owner.id)
    elif UserRole.VTS_ADMIN.value in role_codes(actor):
        provider = await get_provider_for_user(session, actor.id)
        if provider is None:
            raise HTTPException(status_code=404, detail="VTS provider not found")
        query = query.where(VTSProviderOwnerLink.provider_id == provider.id)
        count_query = count_query.where(VTSProviderOwnerLink.provider_id == provider.id)
    else:
        raise HTTPException(status_code=403, detail="You cannot view provider-owner links")

    if link_status:
        query = query.where(VTSProviderOwnerLink.status == link_status)
        count_query = count_query.where(VTSProviderOwnerLink.status == link_status)
    links = list(
        await session.scalars(
            query.order_by(VTSProviderOwnerLink.created_at.desc()).offset(offset).limit(limit)
        )
    )
    return OwnerProviderLinkPage(
        items=[await build_link_read(session, link) for link in links],
        total=int(await session.scalar(count_query) or 0),
        offset=offset,
        limit=limit,
    )


@router.post(
    "/provider-links/{link_id}/respond",
    response_model=OwnerProviderLinkRead,
)
async def respond_provider_link(
    link_id: uuid.UUID,
    payload: OwnerProviderLinkResponse,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerProviderLinkRead:
    link = await session.get(VTSProviderOwnerLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Provider-owner link not found")

    if link.status == OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL:
        owner = await session.get(VehicleOwner, link.owner_id)
        if owner is None or not await user_can_access_owner(
            session,
            user_id=actor.id,
            owner=owner,
        ):
            raise HTTPException(status_code=403, detail="Only the vehicle owner can respond")
    elif link.status == OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL:
        provider = await get_provider_for_user(session, actor.id)
        if provider is None or provider.id != link.provider_id:
            raise HTTPException(
                status_code=403,
                detail="Only the selected VTS provider can respond",
            )
    else:
        raise HTTPException(status_code=409, detail="This link is not awaiting a response")

    link.responded_by_user_id = actor.id
    link.responded_at = datetime.now(UTC)
    link.reason = payload.notes
    link.status = (
        OwnerProviderLinkStatus.ACTIVE
        if payload.decision == OwnerProviderLinkDecision.APPROVE
        else OwnerProviderLinkStatus.REJECTED
    )
    await session.commit()
    await session.refresh(link)
    return await build_link_read(session, link)


@router.post(
    "/provider-links/{link_id}/unlink",
    response_model=OwnerProviderLinkRead,
)
async def unlink_provider(
    link_id: uuid.UUID,
    payload: OwnerProviderUnlink,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerProviderLinkRead:
    link = await session.get(VTSProviderOwnerLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Provider-owner link not found")
    owner = await session.get(VehicleOwner, link.owner_id)
    if owner is None or not await user_can_access_owner(
        session,
        user_id=actor.id,
        owner=owner,
    ):
        raise HTTPException(status_code=403, detail="Only the vehicle owner can unlink")
    if link.status not in {
        OwnerProviderLinkStatus.ACTIVE,
        OwnerProviderLinkStatus.SUSPENDED,
    }:
        raise HTTPException(status_code=409, detail="This provider link is not active")

    now = datetime.now(UTC)
    link.status = OwnerProviderLinkStatus.ENDED
    link.ended_by_user_id = actor.id
    link.ended_at = now
    link.reason = payload.reason

    assignments = list(
        await session.scalars(
            select(VehicleDeviceAssignment)
            .join(Vehicle, Vehicle.id == VehicleDeviceAssignment.vehicle_id)
            .where(
                Vehicle.owner_id == owner.id,
                VehicleDeviceAssignment.provider_id == link.provider_id,
                VehicleDeviceAssignment.status.in_(
                    [
                        TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
                        TrackingAssignmentStatus.ACTIVE,
                    ]
                ),
            )
        )
    )
    for assignment in assignments:
        assignment.status = TrackingAssignmentStatus.ENDED
        assignment.valid_to = now
        assignment.is_primary = False
        assignment.rejection_reason = payload.reason

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action="vehicle_owner.provider_unlinked",
        resource_type="vts_provider_owner_link",
        resource_public_id=link.id,
        new_values={
            "provider_id": str(link.provider_id),
            "ended_assignments": len(assignments),
            "reason": payload.reason,
        },
    )
    await session.commit()
    await session.refresh(link)
    return await build_link_read(session, link)


@router.get("", response_model=OwnerPage)
async def list_owner_applications(
    _: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
    verification_status: Annotated[OwnerVerificationStatus | None, Query(alias="status")] = None,
    owner_type: OwnerType | None = None,
    search: Annotated[str | None, Query(max_length=180)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> OwnerPage:
    query = select(VehicleOwner)
    count_query = select(func.count(VehicleOwner.id))
    if verification_status:
        query = query.where(VehicleOwner.verification_status == verification_status)
        count_query = count_query.where(VehicleOwner.verification_status == verification_status)
    if owner_type:
        query = query.where(VehicleOwner.owner_type == owner_type)
        count_query = count_query.where(VehicleOwner.owner_type == owner_type)
    if search:
        pattern = f"%{search.strip().lower()}%"
        condition = or_(
            func.lower(VehicleOwner.name).like(pattern),
            func.lower(VehicleOwner.application_number).like(pattern),
            func.lower(VehicleOwner.owner_code).like(pattern),
            func.lower(VehicleOwner.email).like(pattern),
            func.lower(VehicleOwner.phone).like(pattern),
            func.lower(VehicleOwner.nid_or_registration).like(pattern),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)
    owners = list(
        await session.scalars(
            query.order_by(VehicleOwner.submitted_at.desc()).offset(offset).limit(limit)
        )
    )
    return OwnerPage(
        items=[await build_owner_read(session, owner) for owner in owners],
        total=int(await session.scalar(count_query) or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/me", response_model=OwnerApplicationRead)
async def read_my_owner_application(
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerApplicationRead:
    owner = await get_owner_for_user(session, actor.id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle-owner application not found")
    return await build_owner_read(session, owner)


@router.get("/{owner_id}", response_model=OwnerApplicationRead)
async def read_owner_application(
    owner_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerApplicationRead:
    owner = await get_owner_by_id(session, owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    await ensure_owner_access(session, actor=actor, owner=owner)
    return await build_owner_read(session, owner)


@router.patch("/{owner_id}", response_model=OwnerApplicationRead)
async def update_owner_application(
    owner_id: uuid.UUID,
    payload: OwnerApplicationUpdate,
    request: Request,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerApplicationRead:
    owner = await get_owner_by_id(session, owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    await ensure_owner_access(session, actor=actor, owner=owner)

    is_admin = can_manage_all_owners(actor)
    owner_editing = await user_can_access_owner(session, user_id=actor.id, owner=owner)
    provider = await actor_provider(session, actor)
    provider_editing = bool(
        provider
        and (
            owner.created_by_provider_id == provider.id
            or await has_active_provider_owner_link(
                session,
                provider_id=provider.id,
                owner_id=owner.id,
            )
        )
    )
    if not is_admin and not owner_editing and not provider_editing:
        raise HTTPException(status_code=403, detail="You cannot update this owner")

    changes = payload.model_dump(exclude_unset=True)
    documents = changes.pop("documents", None)
    field_map = {"owner_name": "name", "registered_address": "address"}
    previous_status = owner.verification_status
    changed_fields: list[str] = []
    for field, value in changes.items():
        model_field = field_map.get(field, field)
        if getattr(owner, model_field) != value:
            setattr(owner, model_field, value)
            changed_fields.append(field)
    if documents is not None:
        await replace_owner_documents(session, owner_id=owner.id, documents=documents)
        changed_fields.append("documents")

    if not is_admin and changed_fields:
        owner.verification_status = OwnerVerificationStatus.PENDING
        owner.reviewed_by_id = None
        owner.reviewed_at = None
        owner.review_notes = None
        owner.submitted_at = datetime.now(UTC)
        if owner.tenant_id is not None:
            tenant = await session.get(Tenant, owner.tenant_id)
            if tenant:
                tenant.status = TenantStatus.PENDING
        if owner.root_organization_id is not None:
            organization = await session.get(Organization, owner.root_organization_id)
            if organization:
                organization.status = OrganizationStatus.PENDING
        owner_documents = list(
            await session.scalars(
                select(VehicleOwnerDocument).where(
                    VehicleOwnerDocument.owner_id == owner.id,
                    VehicleOwnerDocument.is_active.is_(True),
                )
            )
        )
        for document in owner_documents:
            document.status = OwnerDocumentStatus.PENDING
            document.verified_by_id = None
            document.verified_at = None
            document.review_notes = None

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action="vehicle_owner.application_updated",
        resource_type="vehicle_owner",
        resource_public_id=owner.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={"verification_status": previous_status.value},
        new_values={
            "verification_status": owner.verification_status.value,
            "changed_fields": changed_fields,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Owner identity already exists") from exc
    await session.refresh(owner)
    return await build_owner_read(session, owner)


@router.post("/{owner_id}/review", response_model=OwnerApplicationRead)
async def review_owner_application(
    owner_id: uuid.UUID,
    payload: OwnerReview,
    request: Request,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerApplicationRead:
    owner = await get_owner_by_id(session, owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    if owner.tenant_id is None or owner.root_organization_id is None:
        raise HTTPException(status_code=409, detail="Owner identity scope is incomplete")
    tenant = await session.get(Tenant, owner.tenant_id)
    organization = await session.get(Organization, owner.root_organization_id)
    if tenant is None or organization is None:
        raise HTTPException(status_code=409, detail="Owner identity scope is missing")

    now = datetime.now(UTC)
    owner.reviewed_by_id = actor.id
    owner.reviewed_at = now
    owner.review_notes = payload.notes
    documents = list(
        await session.scalars(
            select(VehicleOwnerDocument).where(
                VehicleOwnerDocument.owner_id == owner.id,
                VehicleOwnerDocument.is_active.is_(True),
            )
        )
    )
    if payload.decision == OwnerReviewDecision.APPROVE:
        owner.verification_status = OwnerVerificationStatus.APPROVED
        tenant.status = TenantStatus.ACTIVE
        organization.status = OrganizationStatus.ACTIVE
        owner_user = (
            await session.get(User, owner.primary_admin_user_id)
            if owner.primary_admin_user_id
            else None
        )
        if owner_user:
            owner_user.identity_verification_status = IdentityVerificationStatus.VERIFIED
            owner_user.identity_assurance_level = IdentityAssuranceLevel.SUBSTANTIAL
        for document in documents:
            document.status = OwnerDocumentStatus.VERIFIED
            document.verified_by_id = actor.id
            document.verified_at = now
            document.review_notes = payload.notes
    elif payload.decision == OwnerReviewDecision.REQUEST_CHANGES:
        owner.verification_status = OwnerVerificationStatus.CHANGES_REQUESTED
        tenant.status = TenantStatus.PENDING
        organization.status = OrganizationStatus.PENDING
        for document in documents:
            document.status = OwnerDocumentStatus.PENDING
            document.review_notes = payload.notes
    else:
        owner.verification_status = OwnerVerificationStatus.REJECTED
        tenant.status = TenantStatus.SUSPENDED
        organization.status = OrganizationStatus.SUSPENDED
        for document in documents:
            document.status = OwnerDocumentStatus.REJECTED
            document.review_notes = payload.notes

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action=f"vehicle_owner.application_{payload.decision.value}",
        resource_type="vehicle_owner",
        resource_public_id=owner.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={
            "verification_status": owner.verification_status.value,
            "review_notes": payload.notes,
        },
    )
    await session.commit()
    await session.refresh(owner)
    return await build_owner_read(session, owner)
