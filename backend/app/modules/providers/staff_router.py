import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    IdentifierType,
    MembershipStatus,
    ProviderStatus,
    UserRole,
    UserStatus,
)
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User, UserIdentifier, VTSUserProfile
from app.modules.auth.service import (
    change_password,
    create_user_identity,
    get_security,
    get_user_by_public_id,
    revoke_all_sessions,
    update_primary_identifier,
)
from app.modules.iam.model import (
    MembershipRole,
    Organization,
    OrganizationMembership,
    Role,
    Tenant,
)
from app.modules.iam.service import create_membership, get_roles_by_codes
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user
from app.modules.providers.staff_schema import (
    ProviderStaffCreate,
    ProviderStaffMessage,
    ProviderStaffPage,
    ProviderStaffPasswordReset,
    ProviderStaffRead,
    ProviderStaffUpdate,
)

router = APIRouter(prefix="/providers/staff", tags=["VTS Provider Staff"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def approved_provider_for_admin(session: AsyncSession, actor: User) -> VTSProvider:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider application not found")
    if provider.primary_admin_user_id != actor.id:
        raise HTTPException(status_code=403, detail="Only the primary provider administrator can manage staff")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(
            status_code=409,
            detail="Provider staff management is available only after provider approval",
        )
    return provider


async def provider_membership(
    session: AsyncSession,
    provider: VTSProvider,
    user_public_id: uuid.UUID,
) -> tuple[User, OrganizationMembership]:
    user = await get_user_by_public_id(session, user_public_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Provider staff member not found")

    membership = await session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == user.id,
            OrganizationMembership.tenant_id == provider.tenant_id,
            OrganizationMembership.organization_id == provider.root_organization_id,
            OrganizationMembership.status != MembershipStatus.ENDED,
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Provider staff member not found")
    return user, membership


async def identifier_value(
    session: AsyncSession,
    user_id: int,
    identifier_type: IdentifierType,
) -> str | None:
    return await session.scalar(
        select(UserIdentifier.normalized_value).where(
            UserIdentifier.user_id == user_id,
            UserIdentifier.identifier_type == identifier_type,
            UserIdentifier.disabled_at.is_(None),
        )
    )


async def membership_role(session: AsyncSession, membership_id: int) -> tuple[str, str]:
    row = (
        await session.execute(
            select(Role.code, Role.name)
            .join(MembershipRole, MembershipRole.role_id == Role.id)
            .where(MembershipRole.membership_id == membership_id)
            .order_by(Role.code)
        )
    ).first()
    return (row[0], row[1]) if row else ("unassigned", "Unassigned")


async def build_staff_read(
    session: AsyncSession,
    provider: VTSProvider,
    user: User,
    membership: OrganizationMembership,
) -> ProviderStaffRead:
    role_code, role_name = await membership_role(session, membership.id)
    profile = await session.scalar(select(VTSUserProfile).where(VTSUserProfile.user_id == user.id))
    security = await get_security(session, user.id)

    return ProviderStaffRead(
        user_public_id=user.public_id,
        membership_public_id=membership.public_id,
        display_name=user.display_name,
        email=await identifier_value(session, user.id, IdentifierType.EMAIL),
        mobile=await identifier_value(session, user.id, IdentifierType.MOBILE),
        user_status=user.status,
        membership_status=membership.status,
        role_code=role_code,
        role_name=role_name,
        employee_id=profile.employee_id if profile else membership.member_code,
        designation=profile.designation if profile else membership.designation,
        is_technical_contact=profile.is_technical_contact if profile else False,
        is_primary_admin=user.id == provider.primary_admin_user_id,
        must_change_password=security.must_change_password if security else False,
        last_login_at=security.last_login_at if security else None,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("", response_model=ProviderStaffPage)
async def list_provider_staff(
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
    search: Annotated[str | None, Query(max_length=180)] = None,
    user_status: Annotated[UserStatus | None, Query(alias="status")] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> ProviderStaffPage:
    provider = await approved_provider_for_admin(session, actor)

    query = (
        select(User, OrganizationMembership)
        .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
        .where(
            OrganizationMembership.tenant_id == provider.tenant_id,
            OrganizationMembership.organization_id == provider.root_organization_id,
            OrganizationMembership.status != MembershipStatus.ENDED,
            User.deleted_at.is_(None),
        )
    )
    count_query = (
        select(func.count(OrganizationMembership.id))
        .join(User, User.id == OrganizationMembership.user_id)
        .where(
            OrganizationMembership.tenant_id == provider.tenant_id,
            OrganizationMembership.organization_id == provider.root_organization_id,
            OrganizationMembership.status != MembershipStatus.ENDED,
            User.deleted_at.is_(None),
        )
    )

    if user_status is not None:
        query = query.where(User.status == user_status)
        count_query = count_query.where(User.status == user_status)

    if search:
        pattern = f"%{search.strip().lower()}%"
        matching_users = select(UserIdentifier.user_id).where(
            func.lower(UserIdentifier.normalized_value).like(pattern),
            UserIdentifier.disabled_at.is_(None),
        )
        condition = or_(
            func.lower(User.display_name).like(pattern),
            User.id.in_(matching_users),
            func.lower(OrganizationMembership.member_code).like(pattern),
            func.lower(OrganizationMembership.designation).like(pattern),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)

    rows = (
        await session.execute(
            query.order_by(User.created_at.desc()).offset(offset).limit(limit)
        )
    ).all()
    total = int(await session.scalar(count_query) or 0)

    return ProviderStaffPage(
        items=[
            await build_staff_read(session, provider, user, membership)
            for user, membership in rows
        ],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("", response_model=ProviderStaffRead, status_code=status.HTTP_201_CREATED)
async def create_provider_staff(
    payload: ProviderStaffCreate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderStaffRead:
    provider = await approved_provider_for_admin(session, actor)
    tenant = await session.get(Tenant, provider.tenant_id)
    organization = await session.get(Organization, provider.root_organization_id)
    if tenant is None or organization is None:
        raise HTTPException(status_code=409, detail="Provider tenant or organization is missing")

    try:
        roles = await get_roles_by_codes(session, [payload.role_code.value])
        user = await create_user_identity(
            session,
            email=payload.email,
            mobile=payload.mobile,
            display_name=payload.full_name,
            password=payload.temporary_password,
            status=UserStatus.ACTIVE,
            created_by_id=actor.id,
            must_change_password=True,
        )
        membership = await create_membership(
            session,
            user_id=user.id,
            tenant=tenant,
            organization=organization,
            roles=roles,
            approved_by_id=actor.id,
            member_code=payload.employee_id,
            designation=payload.designation,
            is_primary=True,
        )
        session.add(
            VTSUserProfile(
                user_id=user.id,
                employee_id=payload.employee_id,
                designation=payload.designation,
                is_technical_contact=payload.is_technical_contact,
            )
        )
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=provider.root_organization_id,
            action="vts_provider.staff_created",
            resource_type="user",
            resource_public_id=user.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "role": payload.role_code.value,
                "employee_id": payload.employee_id,
                "designation": payload.designation,
            },
        )
        await session.commit()
        await session.refresh(user)
        await session.refresh(membership)
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    return await build_staff_read(session, provider, user, membership)


@router.patch("/{user_public_id}", response_model=ProviderStaffRead)
async def update_provider_staff(
    user_public_id: uuid.UUID,
    payload: ProviderStaffUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderStaffRead:
    provider = await approved_provider_for_admin(session, actor)
    user, membership = await provider_membership(session, provider, user_public_id)
    if user.id == provider.primary_admin_user_id:
        raise HTTPException(status_code=400, detail="The primary provider administrator is protected")

    changes = payload.model_dump(exclude_unset=True)
    previous_role, _ = await membership_role(session, membership.id)
    previous = {
        "display_name": user.display_name,
        "status": user.status.value,
        "role": previous_role,
        "employee_id": membership.member_code,
        "designation": membership.designation,
    }
    security_changed = False

    try:
        if "display_name" in changes:
            user.display_name = changes.pop("display_name")
        email = changes.pop("email", None)
        mobile = changes.pop("mobile", None)
        role_code = changes.pop("role_code", None)
        employee_id = changes.pop("employee_id", None) if "employee_id" in changes else None
        employee_id_supplied = "employee_id" in payload.model_fields_set
        designation = changes.pop("designation", None) if "designation" in changes else None
        designation_supplied = "designation" in payload.model_fields_set
        is_technical_contact = (
            changes.pop("is_technical_contact", None)
            if "is_technical_contact" in changes
            else None
        )
        technical_supplied = "is_technical_contact" in payload.model_fields_set
        next_status = changes.pop("status", None)

        if email:
            await update_primary_identifier(
                session,
                user_id=user.id,
                identifier_type=IdentifierType.EMAIL,
                value=email,
            )
        if mobile:
            await update_primary_identifier(
                session,
                user_id=user.id,
                identifier_type=IdentifierType.MOBILE,
                value=mobile,
            )
        if role_code is not None:
            roles = await get_roles_by_codes(session, [role_code.value])
            await session.execute(
                delete(MembershipRole).where(MembershipRole.membership_id == membership.id)
            )
            for role in roles:
                session.add(MembershipRole(membership_id=membership.id, role_id=role.id))
            security_changed = role_code.value != previous_role
        if next_status is not None:
            user.status = next_status
            membership.status = (
                MembershipStatus.ACTIVE
                if next_status == UserStatus.ACTIVE
                else MembershipStatus.SUSPENDED
            )
            security_changed = True

        if employee_id_supplied:
            membership.member_code = employee_id
        if designation_supplied:
            membership.designation = designation

        profile = await session.scalar(
            select(VTSUserProfile).where(VTSUserProfile.user_id == user.id)
        )
        if profile is None:
            profile = VTSUserProfile(user_id=user.id)
            session.add(profile)
        if employee_id_supplied:
            profile.employee_id = employee_id
        if designation_supplied:
            profile.designation = designation
        if technical_supplied:
            profile.is_technical_contact = bool(is_technical_contact)

        user.updated_by_id = actor.id
        membership.approved_by_id = actor.id
        membership.approved_at = datetime.now(UTC)

        if security_changed:
            security = await get_security(session, user.id)
            if security:
                security.token_version += 1
            await revoke_all_sessions(session, user.id)

        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=provider.root_organization_id,
            action="vts_provider.staff_updated",
            resource_type="user",
            resource_public_id=user.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values=previous,
            new_values=payload.model_dump(exclude_unset=True, mode="json"),
        )
        await session.commit()
        await session.refresh(user)
        await session.refresh(membership)
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    return await build_staff_read(session, provider, user, membership)


@router.post("/{user_public_id}/reset-password", response_model=ProviderStaffMessage)
async def reset_provider_staff_password(
    user_public_id: uuid.UUID,
    payload: ProviderStaffPasswordReset,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderStaffMessage:
    provider = await approved_provider_for_admin(session, actor)
    user, _ = await provider_membership(session, provider, user_public_id)
    if user.id == provider.primary_admin_user_id:
        raise HTTPException(status_code=400, detail="Use the account security flow for the primary administrator")

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
        action="vts_provider.staff_password_reset",
        resource_type="user",
        resource_public_id=user.public_id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        reason=payload.reason,
    )
    await session.commit()
    return ProviderStaffMessage(message="Temporary password set; all staff sessions were revoked")
