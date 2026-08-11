import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EntityStatus, OwnerVerificationStatus, ProviderStatus, UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.auth.service import get_security, mask_mobile
from app.modules.drivers.enums import (
    DriverClaimStatus,
    DriverLinkSource,
    DriverLinkStatus,
)
from app.modules.drivers.model import (
    Driver,
    DriverLicence,
    VehicleOwnerDriverLink,
    VTSProviderDriverLink,
)
from app.modules.drivers.owner_link_schema import (
    OwnerDriverLinkPage,
    OwnerDriverLinkRequest,
    OwnerDriverLinkRequestResult,
    OwnerDriverLookupRequest,
    OwnerDriverLookupResponse,
    ProviderOwnerDriverRegister,
    ProviderOwnerDriverRegistrationResult,
)
from app.modules.drivers.schema import DriverRegistrationResult
from app.modules.drivers.service import (
    build_driver_read,
    build_owner_link_read,
    build_provider_link_read,
    create_driver_account,
    create_driver_record,
    create_or_reopen_provider_driver_link,
    get_driver_by_nid,
    mask_driver_nid,
)
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import (
    get_owner_for_user,
    has_active_provider_owner_link,
)
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user

router = APIRouter(prefix="/drivers/owner-links", tags=["Owner Driver Links"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def mask_licence_number(value: str) -> str:
    return "*" * max(4, len(value) - 4) + value[-4:]


async def resolve_owner_scope(
    session: AsyncSession,
    *,
    actor: User,
    requested_owner_id: uuid.UUID | None,
) -> tuple[VehicleOwner, VTSProvider | None, DriverLinkSource]:
    roles = set(getattr(actor, "_role_codes", set()))
    if UserRole.VEHICLE_OWNER.value in roles:
        owner = await get_owner_for_user(session, actor.id)
        if owner is None:
            raise HTTPException(status_code=404, detail="Vehicle owner not found")
        if requested_owner_id is not None and requested_owner_id != owner.id:
            raise HTTPException(status_code=403, detail="You can manage only your own driver pool")
        if owner.verification_status != OwnerVerificationStatus.APPROVED:
            raise HTTPException(status_code=403, detail="Vehicle owner is not approved")
        return owner, None, DriverLinkSource.VEHICLE_OWNER

    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="VTS provider is not approved")
    if requested_owner_id is None:
        raise HTTPException(
            status_code=422,
            detail="owner_id is required when a VTS provider acts for a vehicle owner",
        )
    owner = await session.get(VehicleOwner, requested_owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    if owner.verification_status != OwnerVerificationStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Vehicle owner is not approved")
    if not await has_active_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
    ):
        raise HTTPException(
            status_code=403,
            detail="The VTS provider must have an active link with this vehicle owner",
        )
    return owner, provider, DriverLinkSource.VTS_PROVIDER


async def get_owner_driver_link(
    session: AsyncSession,
    *,
    owner_id: uuid.UUID,
    driver_id: uuid.UUID,
) -> VehicleOwnerDriverLink | None:
    return await session.scalar(
        select(VehicleOwnerDriverLink).where(
            VehicleOwnerDriverLink.owner_id == owner_id,
            VehicleOwnerDriverLink.driver_id == driver_id,
        )
    )


async def create_or_reopen_owner_link(
    session: AsyncSession,
    *,
    owner_id: uuid.UUID,
    driver_id: uuid.UUID,
    requested_by: DriverLinkSource,
    requested_by_user_id: int,
) -> tuple[VehicleOwnerDriverLink, bool]:
    link = await get_owner_driver_link(
        session,
        owner_id=owner_id,
        driver_id=driver_id,
    )
    if link is None:
        link = VehicleOwnerDriverLink(
            owner_id=owner_id,
            driver_id=driver_id,
            status=DriverLinkStatus.PENDING_DRIVER_APPROVAL,
            requested_by=requested_by,
            requested_by_user_id=requested_by_user_id,
        )
        session.add(link)
        await session.flush()
        return link, True

    if link.status in {
        DriverLinkStatus.ACTIVE,
        DriverLinkStatus.PENDING_DRIVER_APPROVAL,
        DriverLinkStatus.SUSPENDED,
    }:
        return link, False

    link.status = DriverLinkStatus.PENDING_DRIVER_APPROVAL
    link.requested_by = requested_by
    link.requested_by_user_id = requested_by_user_id
    link.requested_at = datetime.now(UTC)
    link.responded_by_user_id = None
    link.responded_at = None
    link.ended_at = None
    link.reason = None
    await session.flush()
    return link, True


def next_lookup_action(
    owner_link_status: DriverLinkStatus | None,
    provider_link_status: DriverLinkStatus | None,
    *,
    provider_actor: bool,
) -> tuple[bool, str]:
    statuses = [
        status for status in (owner_link_status, provider_link_status) if status is not None
    ]
    if owner_link_status == DriverLinkStatus.ACTIVE and (
        not provider_actor or provider_link_status == DriverLinkStatus.ACTIVE
    ):
        return False, "already_connected"
    if DriverLinkStatus.SUSPENDED in statuses:
        return False, "contact_support"
    if any(
        status
        in {
            DriverLinkStatus.PENDING_DRIVER_APPROVAL,
            DriverLinkStatus.PENDING_ORGANIZATION_APPROVAL,
        }
        for status in statuses
    ):
        return False, "await_driver_approval"
    return True, "send_link_request"


@router.post("/lookup", response_model=OwnerDriverLookupResponse)
async def lookup_driver_for_owner(
    payload: OwnerDriverLookupRequest,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.VTS_ADMIN, UserRole.VEHICLE_OWNER)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerDriverLookupResponse:
    owner, provider, _ = await resolve_owner_scope(
        session,
        actor=actor,
        requested_owner_id=payload.owner_id,
    )
    driver = await get_driver_by_nid(session, payload.nid_reference)
    if driver is None:
        return OwnerDriverLookupResponse(
            exists=False,
            can_send_request=False,
            next_action="complete_driver_registration",
        )

    owner_link = await get_owner_driver_link(
        session,
        owner_id=owner.id,
        driver_id=driver.id,
    )
    provider_link = None
    if provider is not None:
        provider_link = await session.scalar(
            select(VTSProviderDriverLink).where(
                VTSProviderDriverLink.provider_id == provider.id,
                VTSProviderDriverLink.driver_id == driver.id,
            )
        )
    licence = await session.scalar(
        select(DriverLicence).where(DriverLicence.driver_id == driver.id)
    )
    can_send_request, next_action = next_lookup_action(
        owner_link.status if owner_link else None,
        provider_link.status if provider_link else None,
        provider_actor=provider is not None,
    )
    return OwnerDriverLookupResponse(
        exists=True,
        driver_id=driver.id,
        driver_name=driver.full_name,
        masked_nid_reference=mask_driver_nid(driver.nid_reference),
        masked_mobile=mask_mobile(driver.phone),
        masked_licence_number=(mask_licence_number(licence.licence_number) if licence else None),
        licence_type=licence.licence_type if licence else None,
        licence_expiry_date=licence.expiry_date if licence else None,
        driver_verification_status=driver.verification_status,
        licence_verification_status=licence.verification_status if licence else None,
        owner_link_status=owner_link.status if owner_link else None,
        provider_link_status=provider_link.status if provider_link else None,
        can_send_request=can_send_request,
        next_action=next_action,
    )


@router.post("/request", response_model=OwnerDriverLinkRequestResult)
async def request_owner_driver_link(
    payload: OwnerDriverLinkRequest,
    request: Request,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.VTS_ADMIN, UserRole.VEHICLE_OWNER)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerDriverLinkRequestResult:
    owner, provider, source = await resolve_owner_scope(
        session,
        actor=actor,
        requested_owner_id=payload.owner_id,
    )
    driver = await session.get(Driver, payload.driver_id)
    if driver is None or driver.status != EntityStatus.ACTIVE:
        raise HTTPException(status_code=404, detail="Active driver not found")

    try:
        owner_link, created_owner_link = await create_or_reopen_owner_link(
            session,
            owner_id=owner.id,
            driver_id=driver.id,
            requested_by=source,
            requested_by_user_id=actor.id,
        )
        provider_link = None
        created_provider_link = False
        if provider is not None:
            provider_link, created_provider_link = await create_or_reopen_provider_driver_link(
                session,
                provider_id=provider.id,
                driver_id=driver.id,
                requested_by=DriverLinkSource.VTS_PROVIDER,
                requested_by_user_id=actor.id,
            )
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action="driver.owner_link_requested",
            resource_type="vehicle_owner_driver_link",
            resource_public_id=owner_link.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "owner_id": str(owner.id),
                "driver_id": str(driver.id),
                "provider_id": str(provider.id) if provider else None,
                "requested_by": source.value,
                "owner_link_status": owner_link.status.value,
                "provider_link_status": provider_link.status.value if provider_link else None,
            },
        )
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    await session.refresh(owner_link)
    if provider_link is not None:
        await session.refresh(provider_link)
    return OwnerDriverLinkRequestResult(
        owner_link=await build_owner_link_read(session, owner_link),
        provider_link=(
            await build_provider_link_read(session, provider_link) if provider_link else None
        ),
        created_owner_link=created_owner_link,
        created_provider_link=created_provider_link,
        message=(
            "Driver approval is pending for the owner and VTS provider links"
            if provider is not None
            else "Driver approval is pending for the vehicle-owner link"
        ),
    )


@router.post("/provider-register", response_model=ProviderOwnerDriverRegistrationResult)
async def provider_register_driver_for_owner(
    payload: ProviderOwnerDriverRegister,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderOwnerDriverRegistrationResult:
    owner, provider, _ = await resolve_owner_scope(
        session,
        actor=actor,
        requested_owner_id=payload.owner_id,
    )
    if provider is None:
        raise HTTPException(status_code=403, detail="VTS provider scope is required")

    existing = await get_driver_by_nid(session, payload.nid_reference)
    already_registered = existing is not None
    login_username = None
    try:
        if existing is None:
            if not payload.login_username:
                raise HTTPException(
                    status_code=422,
                    detail="login_username is required when creating a new driver account",
                )
            user = await create_driver_account(
                session,
                email=payload.email,
                mobile=payload.mobile,
                username=payload.login_username,
                display_name=payload.full_name,
                password=payload.temporary_password or secrets.token_urlsafe(32),
                created_by_user_id=actor.id,
                must_change_password=True,
            )
            driver = await create_driver_record(
                session,
                payload=payload,
                user=user,
                claim_status=DriverClaimStatus.PENDING_CLAIM,
                created_by_provider_id=provider.id,
                created_by_owner_id=owner.id,
            )
            login_username = payload.login_username
        else:
            driver = existing

        provider_link, _ = await create_or_reopen_provider_driver_link(
            session,
            provider_id=provider.id,
            driver_id=driver.id,
            requested_by=DriverLinkSource.VTS_PROVIDER,
            requested_by_user_id=actor.id,
        )
        owner_link, _ = await create_or_reopen_owner_link(
            session,
            owner_id=owner.id,
            driver_id=driver.id,
            requested_by=DriverLinkSource.VTS_PROVIDER,
            requested_by_user_id=actor.id,
        )
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action="driver.provider_created_for_owner",
            resource_type="driver",
            resource_public_id=driver.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "owner_id": str(owner.id),
                "provider_id": str(provider.id),
                "already_registered": already_registered,
                "owner_link_status": owner_link.status.value,
                "provider_link_status": provider_link.status.value,
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
    registration = DriverRegistrationResult(
        driver=await build_driver_read(session, driver),
        already_registered=already_registered,
        login_username=login_username,
        must_change_password=bool(security and security.must_change_password),
        message=(
            "Existing driver reused and both consent links prepared"
            if already_registered
            else "Driver account created for the owner; driver approval is pending"
        ),
    )
    return ProviderOwnerDriverRegistrationResult(
        registration=registration,
        owner_link=await build_owner_link_read(session, owner_link),
        provider_link=await build_provider_link_read(session, provider_link),
    )


@router.get("", response_model=OwnerDriverLinkPage)
async def list_owner_driver_links(
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.VTS_ADMIN, UserRole.VEHICLE_OWNER)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
    owner_id: uuid.UUID | None = None,
    link_status: Annotated[DriverLinkStatus | None, Query(alias="status")] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> OwnerDriverLinkPage:
    owner, _, _ = await resolve_owner_scope(
        session,
        actor=actor,
        requested_owner_id=owner_id,
    )
    query = select(VehicleOwnerDriverLink).where(VehicleOwnerDriverLink.owner_id == owner.id)
    if link_status is not None:
        query = query.where(VehicleOwnerDriverLink.status == link_status)
    links = list(await session.scalars(query.order_by(VehicleOwnerDriverLink.created_at.desc())))
    page = links[offset : offset + limit]
    return OwnerDriverLinkPage(
        items=[await build_owner_link_read(session, link) for link in page],
        total=len(links),
        offset=offset,
        limit=limit,
    )
