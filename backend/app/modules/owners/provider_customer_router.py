import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.identifier_service import IdentifierManagementError
from app.modules.auth.model import User
from app.modules.auth.service import change_password, user_has_role
from app.modules.auth.schema import MessageResponse
from app.modules.owners.enums import OwnerProviderLinkStatus
from app.modules.owners.model import VehicleOwner
from app.modules.owners.provider_customer_schema import (
    ProviderManagedOwnerUpdate,
    ProviderOwnerPasswordReset,
    ProviderManagedOwnerUpdateResult,
    ProviderOwnerCustomerPage,
    ProviderOwnerCustomerRead,
    ProviderOwnerCustomerSummary,
    ProviderOwnerOption,
    ProviderOwnerPortfolioPage,
)
from app.modules.owners.provider_customer_service import (
    ProviderCustomerManagementError,
    build_provider_customer_read,
    build_provider_customer_summary,
    get_provider_customer_link,
    require_active_customer_link,
    list_provider_customers,
    list_provider_owner_options,
    list_provider_owner_portfolio,
    require_approved_provider,
    update_provider_customer,
)

router = APIRouter(prefix="/providers/me/owners", tags=["VTS Provider Customers"])

PROVIDER_OWNER_READ_ROLES = (
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VTS_VIEWER,
)
PROVIDER_OWNER_OPTION_ROLES = (
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VTS_TECHNICAL,
    UserRole.VTS_VIEWER,
)
PROVIDER_OWNER_MANAGE_ROLES = (
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def current_provider_or_error(
    session: AsyncSession,
    actor: User,
):
    try:
        return await require_approved_provider(session, user_id=actor.id)
    except ProviderCustomerManagementError as exc:
        message = str(exc)
        status_code = 404 if "not found" in message else 403
        raise HTTPException(status_code=status_code, detail=message) from None


@router.get("/summary", response_model=ProviderOwnerCustomerSummary)
async def read_customer_summary(
    actor: Annotated[User, Depends(require_roles(*PROVIDER_OWNER_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderOwnerCustomerSummary:
    provider = await current_provider_or_error(session, actor)
    return await build_provider_customer_summary(session, provider=provider)


@router.get("/options", response_model=list[ProviderOwnerOption])
async def read_provider_owner_options(
    actor: Annotated[User, Depends(require_roles(*PROVIDER_OWNER_OPTION_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    search: Annotated[str | None, Query(max_length=180)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[ProviderOwnerOption]:
    provider = await current_provider_or_error(session, actor)
    return await list_provider_owner_options(
        session,
        provider=provider,
        search=search,
        limit=limit,
    )


@router.get("/portfolio", response_model=ProviderOwnerPortfolioPage)
async def read_provider_owner_portfolio(
    actor: Annotated[User, Depends(require_roles(*PROVIDER_OWNER_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    link_status: Annotated[
        OwnerProviderLinkStatus | None,
        Query(alias="status"),
    ] = None,
    search: Annotated[str | None, Query(max_length=180)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> ProviderOwnerPortfolioPage:
    provider = await current_provider_or_error(session, actor)
    return await list_provider_owner_portfolio(
        session,
        provider=provider,
        link_status=link_status,
        search=search,
        offset=offset,
        limit=limit,
    )


@router.get("", response_model=ProviderOwnerCustomerPage)
async def read_provider_customers(
    actor: Annotated[User, Depends(require_roles(*PROVIDER_OWNER_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    link_status: Annotated[
        OwnerProviderLinkStatus | None,
        Query(alias="status"),
    ] = None,
    search: Annotated[str | None, Query(max_length=180)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> ProviderOwnerCustomerPage:
    provider = await current_provider_or_error(session, actor)
    return await list_provider_customers(
        session,
        provider=provider,
        link_status=link_status,
        search=search,
        offset=offset,
        limit=limit,
    )


@router.get("/{owner_id}", response_model=ProviderOwnerCustomerRead)
async def read_provider_customer(
    owner_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_OWNER_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderOwnerCustomerRead:
    provider = await current_provider_or_error(session, actor)
    link = await get_provider_customer_link(
        session,
        provider_id=provider.id,
        owner_id=owner_id,
    )
    if link is None:
        raise HTTPException(
            status_code=404,
            detail="Vehicle owner is not linked to this provider",
        )
    owner = await session.get(VehicleOwner, owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    return await build_provider_customer_read(session, link=link)


@router.patch("/{owner_id}", response_model=ProviderManagedOwnerUpdateResult)
async def update_linked_owner(
    owner_id: uuid.UUID,
    payload: ProviderManagedOwnerUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_OWNER_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderManagedOwnerUpdateResult:
    provider = await current_provider_or_error(session, actor)
    changed_fields = sorted(payload.model_dump(exclude_unset=True).keys())
    if not changed_fields:
        raise HTTPException(status_code=422, detail="At least one field must be updated")
    try:
        customer, reverification_required = await update_provider_customer(
            session,
            provider=provider,
            actor_user_id=actor.id,
            owner_id=owner_id,
            payload=payload,
        )
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=provider.root_organization_id,
            action="vts_provider.linked_owner_updated",
            resource_type="vehicle_owner",
            resource_public_id=owner_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "provider_id": str(provider.id),
                "changed_fields": changed_fields,
                "reverification_required": reverification_required,
            },
        )
        await session.commit()
    except ProviderCustomerManagementError as exc:
        await session.rollback()
        message = str(exc)
        status_code = 404 if "not linked" in message or "not found" in message else 409
        raise HTTPException(status_code=status_code, detail=message) from None
    except (IdentifierManagementError, ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    return ProviderManagedOwnerUpdateResult(
        customer=customer,
        reverification_required=reverification_required,
        verification_status=customer.owner.verification_status,
        updated_at=customer.owner.updated_at,
    )


@router.post("/{owner_id}/reset-password", response_model=MessageResponse)
async def reset_linked_owner_password(
    owner_id: uuid.UUID,
    payload: ProviderOwnerPasswordReset,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MessageResponse:
    provider = await current_provider_or_error(session, actor)
    try:
        _, owner = await require_active_customer_link(
            session, provider_id=provider.id, owner_id=owner_id
        )
    except ProviderCustomerManagementError:
        raise HTTPException(status_code=404, detail="No active linked owner account") from None

    # An owner can link with multiple providers. A link is NOT authorization
    # to take over the owner's global login. Only the original registering
    # provider may issue a temporary password to its own owner account.
    if owner.created_by_provider_id != provider.id:
        raise HTTPException(
            status_code=403,
            detail="Only the provider that registered this owner can reset the global account",
        )
    if owner.primary_admin_user_id is None:
        raise HTTPException(status_code=409, detail="This owner has no linked login account")
    user = await session.get(User, owner.primary_admin_user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=409, detail="The owner login account is unavailable")
    if user.id in (actor.id, provider.primary_admin_user_id):
        raise HTTPException(status_code=403, detail="This account cannot be reset through owner support")
    if not await user_has_role(session, user.id, UserRole.VEHICLE_OWNER.value):
        raise HTTPException(status_code=403, detail="The linked account is not a vehicle owner account")
    if await user_has_role(session, user.id, UserRole.SUPER_ADMIN.value):
        raise HTTPException(status_code=403, detail="Privileged accounts require administrator recovery")

    await change_password(
        session,
        user=user,
        new_password=payload.new_password,
        must_change_password=True,
    )
    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=provider.root_organization_id,
        action="vts_provider.owner_password_reset",
        resource_type="vehicle_owner",
        resource_public_id=owner.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        reason=payload.reason,
        new_values={
            "user_public_id": str(user.public_id),
            "must_change_password": True,
            "sessions_revoked": True,
        },
    )
    await session.commit()
    return MessageResponse(
        message="Temporary password set. Existing sessions were revoked; the owner must change their password at next login."
    )
