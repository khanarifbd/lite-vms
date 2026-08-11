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
    OwnerVerificationStatus,
    ProviderStatus,
    UserRole,
)
from app.core.config import settings
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User
from app.modules.auth.service import get_security
from app.modules.drivers.enums import (
    DriverClaimStatus,
    DriverDocumentStatus,
    DriverLicenceStatus,
    DriverLinkDecision,
    DriverLinkSource,
    DriverLinkStatus,
    DriverReviewDecision,
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
    DriverLinkRead,
    DriverLinkResponse,
    DriverLookupRequest,
    DriverLookupResponse,
    DriverPage,
    DriverRead,
    DriverRegistrationResult,
    DriverReview,
    DriverSelfRegister,
    ManagedDriverRegister,
)
from app.modules.drivers.service import (
    build_driver_read,
    build_owner_link_read,
    build_provider_link_read,
    create_driver_account,
    create_driver_record,
    create_or_reopen_owner_driver_link,
    create_or_reopen_provider_driver_link,
    get_driver_by_nid,
    get_driver_for_user,
    get_driver_username,
    owner_has_active_driver_link,
    provider_has_active_driver_link,
)
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import get_owner_for_user
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user

router = APIRouter(prefix="/drivers", tags=["Global Driver Registry"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def actor_roles(user: User) -> set[str]:
    return set(getattr(user, "_role_codes", set()))


def can_review_drivers(user: User) -> bool:
    return bool(
        actor_roles(user).intersection({UserRole.SUPER_ADMIN.value, UserRole.POLICE_ADMIN.value})
    )


async def ensure_driver_access(
    session: AsyncSession,
    *,
    actor: User,
    driver: Driver,
) -> None:
    if can_review_drivers(actor) or driver.user_id == actor.id:
        return
    provider = await get_provider_for_user(session, actor.id)
    if provider and await provider_has_active_driver_link(
        session,
        provider_id=provider.id,
        driver_id=driver.id,
    ):
        return
    owner = await get_owner_for_user(session, actor.id)
    if owner and await owner_has_active_driver_link(
        session,
        owner_id=owner.id,
        driver_id=driver.id,
    ):
        return
    raise HTTPException(status_code=403, detail="You cannot access this driver")


async def existing_driver_conflict(
    session: AsyncSession,
    driver: Driver,
) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "code": "driver_already_registered",
            "message": "This driver is already registered",
            "driver_id": str(driver.id),
            "driver_name": driver.full_name,
            "nid_reference": driver.nid_reference,
            "mobile": driver.phone,
            "username": await get_driver_username(session, driver),
            "next_action": "request_mobile_password_reset",
        },
    )


@router.post(
    "/register",
    response_model=DriverRegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
async def self_register_driver(
    payload: DriverSelfRegister,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverRegistrationResult:
    if not settings.allow_public_registration:
        raise HTTPException(status_code=403, detail="Public registration is disabled")
    existing = await get_driver_by_nid(session, payload.nid_reference)
    if existing is not None:
        raise await existing_driver_conflict(session, existing)

    try:
        user = await create_driver_account(
            session,
            email=payload.email,
            mobile=payload.mobile,
            username=payload.login_username,
            display_name=payload.full_name,
            password=payload.password,
            created_by_user_id=None,
            must_change_password=False,
        )
        driver = await create_driver_record(
            session,
            payload=payload,
            user=user,
            claim_status=DriverClaimStatus.CLAIMED,
        )
        await write_audit_log(
            session,
            actor_user_id=user.id,
            action="driver.self_registered",
            resource_type="driver",
            resource_public_id=driver.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={"driver_code": driver.driver_code},
        )
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    await session.refresh(driver)
    return DriverRegistrationResult(
        driver=await build_driver_read(session, driver),
        already_registered=False,
        login_username=payload.login_username,
        must_change_password=False,
        message="Driver registration submitted successfully",
    )


@router.post("/lookup", response_model=DriverLookupResponse)
async def lookup_driver(
    payload: DriverLookupRequest,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.VTS_ADMIN, UserRole.VEHICLE_OWNER)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverLookupResponse:
    driver = await get_driver_by_nid(session, payload.nid_reference)
    if driver is None:
        return DriverLookupResponse(exists=False, next_action="complete_driver_registration")

    current_link_status: DriverLinkStatus | None = None
    provider = await get_provider_for_user(session, actor.id)
    if provider:
        link = await session.scalar(
            select(VTSProviderDriverLink).where(
                VTSProviderDriverLink.provider_id == provider.id,
                VTSProviderDriverLink.driver_id == driver.id,
            )
        )
        current_link_status = link.status if link else None
    else:
        owner = await get_owner_for_user(session, actor.id)
        if owner:
            link = await session.scalar(
                select(VehicleOwnerDriverLink).where(
                    VehicleOwnerDriverLink.owner_id == owner.id,
                    VehicleOwnerDriverLink.driver_id == driver.id,
                )
            )
            current_link_status = link.status if link else None
    return DriverLookupResponse(
        exists=True,
        driver_id=driver.id,
        driver_name=driver.full_name,
        nid_reference=driver.nid_reference,
        mobile=driver.phone,
        verification_status=driver.verification_status,
        current_link_status=current_link_status,
        next_action=("already_linked" if current_link_status else "request_driver_link"),
    )


async def create_managed_driver(
    session: AsyncSession,
    *,
    payload: ManagedDriverRegister,
    actor: User,
    provider: VTSProvider | None,
    owner: VehicleOwner | None,
) -> tuple[Driver, str | None, bool]:
    existing = await get_driver_by_nid(session, payload.nid_reference)
    if existing is not None:
        return existing, None, True
    if not payload.login_username:
        raise HTTPException(
            status_code=422,
            detail="login_username is required when creating a new driver account",
        )
    password = payload.temporary_password or secrets.token_urlsafe(32)
    user = await create_driver_account(
        session,
        email=payload.email,
        mobile=payload.mobile,
        username=payload.login_username,
        display_name=payload.full_name,
        password=password,
        created_by_user_id=actor.id,
        must_change_password=True,
    )
    driver = await create_driver_record(
        session,
        payload=payload,
        user=user,
        claim_status=DriverClaimStatus.PENDING_CLAIM,
        created_by_provider_id=provider.id if provider else None,
        created_by_owner_id=owner.id if owner else None,
    )
    return driver, payload.login_username, False


@router.post("/provider-register", response_model=DriverRegistrationResult)
async def provider_register_driver(
    payload: ManagedDriverRegister,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverRegistrationResult:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="VTS provider is not approved")
    try:
        driver, username, already_registered = await create_managed_driver(
            session,
            payload=payload,
            actor=actor,
            provider=provider,
            owner=None,
        )
        link, _ = await create_or_reopen_provider_driver_link(
            session,
            provider_id=provider.id,
            driver_id=driver.id,
            requested_by=DriverLinkSource.VTS_PROVIDER,
            requested_by_user_id=actor.id,
        )
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            action="driver.provider_registration_submitted",
            resource_type="driver",
            resource_public_id=driver.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "link_status": link.status.value,
                "already_registered": already_registered,
            },
        )
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    await session.refresh(driver)
    security = await get_security(session, driver.user_id)
    return DriverRegistrationResult(
        driver=await build_driver_read(session, driver),
        already_registered=already_registered,
        login_username=username,
        must_change_password=bool(security and security.must_change_password),
        message=(
            "Existing driver returned and provider link created"
            if already_registered
            else "Driver account created and driver approval is pending"
        ),
    )


@router.post("/owner-register", response_model=DriverRegistrationResult)
async def owner_register_driver(
    payload: ManagedDriverRegister,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverRegistrationResult:
    owner = await get_owner_for_user(session, actor.id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    if owner.verification_status != OwnerVerificationStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Vehicle owner is not approved")
    try:
        driver, username, already_registered = await create_managed_driver(
            session,
            payload=payload,
            actor=actor,
            provider=None,
            owner=owner,
        )
        link, _ = await create_or_reopen_owner_driver_link(
            session,
            owner_id=owner.id,
            driver_id=driver.id,
            requested_by=DriverLinkSource.VEHICLE_OWNER,
            requested_by_user_id=actor.id,
        )
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action="driver.owner_registration_submitted",
            resource_type="driver",
            resource_public_id=driver.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "link_status": link.status.value,
                "already_registered": already_registered,
            },
        )
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    await session.refresh(driver)
    security = await get_security(session, driver.user_id)
    return DriverRegistrationResult(
        driver=await build_driver_read(session, driver),
        already_registered=already_registered,
        login_username=username,
        must_change_password=bool(security and security.must_change_password),
        message=(
            "Existing driver returned and owner link created"
            if already_registered
            else "Driver account created and driver approval is pending"
        ),
    )


@router.get("/me", response_model=DriverRead)
async def read_my_driver_profile(
    actor: Annotated[User, Depends(require_roles(UserRole.DRIVER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverRead:
    driver = await get_driver_for_user(session, actor.id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return await build_driver_read(session, driver)


@router.get("/me/links", response_model=list[DriverLinkRead])
async def list_my_driver_links(
    actor: Annotated[User, Depends(require_roles(UserRole.DRIVER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[DriverLinkRead]:
    driver = await get_driver_for_user(session, actor.id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    provider_links = list(
        await session.scalars(
            select(VTSProviderDriverLink).where(VTSProviderDriverLink.driver_id == driver.id)
        )
    )
    owner_links = list(
        await session.scalars(
            select(VehicleOwnerDriverLink).where(VehicleOwnerDriverLink.driver_id == driver.id)
        )
    )
    return [
        *[await build_provider_link_read(session, link) for link in provider_links],
        *[await build_owner_link_read(session, link) for link in owner_links],
    ]


@router.post("/links/{link_id}/respond", response_model=DriverLinkRead)
async def respond_to_driver_link(
    link_id: uuid.UUID,
    payload: DriverLinkResponse,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.DRIVER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverLinkRead:
    driver = await get_driver_for_user(session, actor.id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    provider_link = await session.get(VTSProviderDriverLink, link_id)
    owner_link = None if provider_link else await session.get(VehicleOwnerDriverLink, link_id)
    link = provider_link or owner_link
    if link is None or link.driver_id != driver.id:
        raise HTTPException(status_code=404, detail="Driver link not found")
    if link.status != DriverLinkStatus.PENDING_DRIVER_APPROVAL:
        raise HTTPException(status_code=409, detail="This link is not awaiting driver approval")

    tenant_id = None
    organization_type = "vts_provider" if provider_link else "vehicle_owner"
    if provider_link is not None:
        provider = await session.get(VTSProvider, provider_link.provider_id)
        tenant_id = provider.tenant_id if provider is not None else None
    elif owner_link is not None:
        owner = await session.get(VehicleOwner, owner_link.owner_id)
        tenant_id = owner.tenant_id if owner is not None else None

    previous_status = link.status
    link.status = (
        DriverLinkStatus.ACTIVE
        if payload.decision == DriverLinkDecision.APPROVE
        else DriverLinkStatus.REJECTED
    )
    link.responded_by_user_id = actor.id
    link.responded_at = datetime.now(UTC)
    link.reason = payload.notes
    await write_audit_log(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor.id,
        action=(
            f"driver.{organization_type}_link_approved"
            if payload.decision == DriverLinkDecision.APPROVE
            else f"driver.{organization_type}_link_rejected"
        ),
        resource_type=f"{organization_type}_driver_link",
        resource_public_id=link.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={"status": previous_status.value},
        new_values={"status": link.status.value, "driver_id": str(driver.id)},
        reason=payload.notes,
    )
    await session.commit()
    await session.refresh(link)
    if provider_link:
        return await build_provider_link_read(session, provider_link)
    if owner_link is None:
        raise HTTPException(status_code=404, detail="Driver link not found")
    return await build_owner_link_read(session, owner_link)


@router.get("", response_model=DriverPage)
async def list_drivers(
    _: Annotated[
        User,
        Depends(
            require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN, UserRole.POLICE_OFFICER)
        ),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
    verification_status: DriverVerificationStatus | None = None,
    search: Annotated[str | None, Query(max_length=180)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> DriverPage:
    query = select(Driver)
    count_query = select(func.count(Driver.id))
    if verification_status:
        query = query.where(Driver.verification_status == verification_status)
        count_query = count_query.where(Driver.verification_status == verification_status)
    if search:
        pattern = f"%{search.strip().lower()}%"
        condition = or_(
            func.lower(Driver.full_name).like(pattern),
            func.lower(Driver.driver_code).like(pattern),
            func.lower(Driver.email).like(pattern),
            Driver.phone.like(f"%{search.strip()}%"),
            func.lower(Driver.nid_reference).like(pattern),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)
    drivers = list(
        await session.scalars(
            query.order_by(Driver.submitted_at.desc()).offset(offset).limit(limit)
        )
    )
    return DriverPage(
        items=[await build_driver_read(session, driver) for driver in drivers],
        total=int(await session.scalar(count_query) or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/{driver_id}", response_model=DriverRead)
async def read_driver(
    driver_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverRead:
    driver = await session.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    await ensure_driver_access(session, actor=actor, driver=driver)
    return await build_driver_read(session, driver)


@router.post("/{driver_id}/review", response_model=DriverRead)
async def review_driver(
    driver_id: uuid.UUID,
    payload: DriverReview,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverRead:
    driver = await session.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    if driver.verification_status == DriverVerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=409,
            detail=(
                "The approved initial Driver application is locked. "
                "Use profile-change review or administrative lock/suspension."
            ),
        )
    licence = await session.scalar(
        select(DriverLicence).where(DriverLicence.driver_id == driver.id)
    )
    if licence is None:
        raise HTTPException(status_code=409, detail="Driver licence record is missing")
    documents = list(
        await session.scalars(
            select(DriverDocument).where(
                DriverDocument.driver_id == driver.id,
                DriverDocument.is_active.is_(True),
            )
        )
    )
    now = datetime.now(UTC)
    driver.reviewed_by_user_id = actor.id
    driver.reviewed_at = now
    driver.review_notes = payload.notes
    if payload.decision == DriverReviewDecision.APPROVE:
        driver.verification_status = DriverVerificationStatus.VERIFIED
        licence.verification_status = DriverLicenceStatus.VERIFIED
        licence.verified_by_user_id = actor.id
        licence.verified_at = now
        licence.review_notes = payload.notes
        user = await session.get(User, driver.user_id)
        if user:
            user.identity_verification_status = IdentityVerificationStatus.VERIFIED
            user.identity_assurance_level = IdentityAssuranceLevel.SUBSTANTIAL
        for document in documents:
            document.status = DriverDocumentStatus.VERIFIED
            document.verified_by_user_id = actor.id
            document.verified_at = now
            document.review_notes = payload.notes
    elif payload.decision == DriverReviewDecision.REQUEST_CHANGES:
        driver.verification_status = DriverVerificationStatus.CHANGES_REQUESTED
        licence.verification_status = DriverLicenceStatus.PENDING
        licence.review_notes = payload.notes
        for document in documents:
            document.status = DriverDocumentStatus.PENDING
            document.review_notes = payload.notes
    else:
        driver.verification_status = DriverVerificationStatus.REJECTED
        licence.verification_status = DriverLicenceStatus.REJECTED
        licence.review_notes = payload.notes
        for document in documents:
            document.status = DriverDocumentStatus.REJECTED
            document.review_notes = payload.notes
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action=f"driver.application_{payload.decision.value}",
        resource_type="driver",
        resource_public_id=driver.id,
        new_values={"verification_status": driver.verification_status.value},
    )
    await session.commit()
    await session.refresh(driver)
    return await build_driver_read(session, driver)
