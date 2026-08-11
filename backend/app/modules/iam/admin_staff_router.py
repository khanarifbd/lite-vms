import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import MembershipStatus, UserRole, UserStatus
from app.core.database import get_session
from app.modules.audit.model import AuditLog
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User, UserIdentifier
from app.modules.auth.service import create_user_identity, revoke_all_sessions
from app.modules.iam.admin_staff_schema import (
    AdminLoginIdentifier,
    AdminStaffAuditItem,
    AdminStaffCreate,
    AdminStaffDetail,
    AdminStaffPage,
    AdminStaffSummary,
    AdminStaffUpdate,
)
from app.modules.iam.model import (
    MembershipRole,
    Organization,
    OrganizationMembership,
    Role,
    Tenant,
)
from app.modules.iam.service import (
    create_membership,
    get_organization_by_public_id,
    get_roles_by_codes,
)

router = APIRouter(prefix="/admin/staff", tags=["Admin User & Role Management"])

PLATFORM_ROLES = {
    UserRole.SUPER_ADMIN.value,
    UserRole.POLICE_ADMIN.value,
    UserRole.POLICE_OFFICER.value,
}


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def active_membership(session: AsyncSession, user_id: int) -> OrganizationMembership | None:
    return await session.scalar(
        select(OrganizationMembership)
        .where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
        )
        .order_by(OrganizationMembership.is_primary.desc(), OrganizationMembership.created_at.desc())
    )


async def build_staff_summary(session: AsyncSession, user: User) -> AdminStaffSummary:
    membership = await active_membership(session, user.id)
    organization = (
        await session.get(Organization, membership.organization_id) if membership else None
    )
    role_codes = []
    if membership:
        role_codes = list(
            await session.scalars(
                select(Role.code)
                .join(MembershipRole, MembershipRole.role_id == Role.id)
                .where(MembershipRole.membership_id == membership.id)
                .order_by(Role.code)
            )
        )
    identifiers = list(
        await session.scalars(
            select(UserIdentifier)
            .where(UserIdentifier.user_id == user.id)
            .order_by(UserIdentifier.is_primary.desc(), UserIdentifier.identifier_type)
        )
    )
    return AdminStaffSummary(
        public_id=user.public_id,
        display_name=user.display_name,
        status=user.status,
        role_codes=role_codes,
        organization_public_id=organization.public_id if organization else None,
        organization_name=organization.name_en if organization else None,
        organization_code=organization.code if organization else None,
        designation=membership.designation if membership else None,
        member_code=membership.member_code if membership else None,
        identifiers=[
            AdminLoginIdentifier(
                public_id=item.public_id,
                identifier_type=item.identifier_type.value,
                masked_value=item.masked_value,
                is_primary=item.is_primary,
                is_verified=item.is_verified,
                disabled_at=item.disabled_at,
            )
            for item in identifiers
        ],
        created_at=user.created_at,
    )


@router.get("", response_model=AdminStaffPage)
async def list_staff(
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
    search: Annotated[str | None, Query(max_length=180)] = None,
    user_status: Annotated[UserStatus | None, Query(alias="status")] = None,
    role: Annotated[str | None, Query(max_length=80)] = None,
    organization_public_id: uuid.UUID | None = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
) -> AdminStaffPage:
    platform_user_ids = (
        select(OrganizationMembership.user_id)
        .join(MembershipRole, MembershipRole.membership_id == OrganizationMembership.id)
        .join(Role, Role.id == MembershipRole.role_id)
        .where(Role.code.in_(PLATFORM_ROLES))
        .distinct()
    )
    query = select(User).where(User.id.in_(platform_user_ids), User.deleted_at.is_(None))
    if user_status is not None:
        query = query.where(User.status == user_status)
    if search:
        pattern = f"%{search.strip().lower()}%"
        identifier_users = select(UserIdentifier.user_id).where(
            func.lower(UserIdentifier.normalized_value).like(pattern)
        )
        query = query.where(
            or_(func.lower(User.display_name).like(pattern), User.id.in_(identifier_users))
        )
    if role:
        role_users = (
            select(OrganizationMembership.user_id)
            .join(MembershipRole, MembershipRole.membership_id == OrganizationMembership.id)
            .join(Role, Role.id == MembershipRole.role_id)
            .where(Role.code == role)
        )
        query = query.where(User.id.in_(role_users))
    if organization_public_id:
        organization = await get_organization_by_public_id(session, organization_public_id)
        if organization is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        organization_users = select(OrganizationMembership.user_id).where(
            OrganizationMembership.organization_id == organization.id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
        )
        query = query.where(User.id.in_(organization_users))

    total = int(await session.scalar(select(func.count()).select_from(query.subquery())) or 0)
    users = list(
        await session.scalars(
            query.order_by(User.created_at.desc()).offset(offset).limit(limit)
        )
    )
    return AdminStaffPage(
        items=[await build_staff_summary(session, user) for user in users],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("", response_model=AdminStaffSummary, status_code=status.HTTP_201_CREATED)
async def create_staff(
    payload: AdminStaffCreate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminStaffSummary:
    role_codes = sorted(set(payload.role_codes))
    if not set(role_codes).issubset(PLATFORM_ROLES):
        raise HTTPException(status_code=400, detail="Only platform and police roles can be assigned")
    organization = await get_organization_by_public_id(session, payload.organization_public_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    tenant = await session.get(Tenant, organization.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=409, detail="Organization tenant is missing")
    try:
        roles = await get_roles_by_codes(session, role_codes)
        user = await create_user_identity(
            session,
            email=str(payload.email),
            mobile=payload.mobile,
            username=payload.username,
            display_name=payload.display_name,
            password=payload.temporary_password,
            status=UserStatus.ACTIVE,
            created_by_id=actor.id,
            must_change_password=True,
        )
        await create_membership(
            session,
            user_id=user.id,
            tenant=tenant,
            organization=organization,
            roles=roles,
            approved_by_id=actor.id,
            member_code=payload.member_code,
            designation=payload.designation,
            is_primary=True,
        )
        await write_audit_log(
            session,
            tenant_id=tenant.id,
            actor_user_id=actor.id,
            actor_organization_id=organization.id,
            action="platform_staff.created",
            resource_type="user",
            resource_public_id=user.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "roles": role_codes,
                "organization": organization.code,
                "designation": payload.designation,
            },
        )
        await session.commit()
        await session.refresh(user)
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return await build_staff_summary(session, user)


@router.get("/{user_public_id}", response_model=AdminStaffDetail)
async def read_staff(
    user_public_id: uuid.UUID,
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminStaffDetail:
    user = await session.scalar(select(User).where(User.public_id == user_public_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    actor_name = (
        select(User.display_name)
        .where(User.id == AuditLog.actor_user_id)
        .correlate(AuditLog)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(
                AuditLog.public_id.label("id"),
                AuditLog.action,
                actor_name.label("actor_name"),
                AuditLog.reason,
                AuditLog.previous_values,
                AuditLog.new_values,
                AuditLog.created_at,
            )
            .where(AuditLog.resource_type == "user", AuditLog.resource_public_id == user.public_id)
            .order_by(AuditLog.created_at.desc())
            .limit(100)
        )
    ).all()
    return AdminStaffDetail(
        user=await build_staff_summary(session, user),
        audit_history=[AdminStaffAuditItem.model_validate(row._mapping) for row in rows],
    )


@router.patch("/{user_public_id}", response_model=AdminStaffSummary)
async def update_staff(
    user_public_id: uuid.UUID,
    payload: AdminStaffUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminStaffSummary:
    user = await session.scalar(select(User).where(User.public_id == user_public_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == actor.id and payload.status is not None and payload.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="You cannot suspend your own account")
    membership = await active_membership(session, user.id)
    if membership is None:
        raise HTTPException(status_code=409, detail="Active platform membership is missing")
    previous = await build_staff_summary(session, user)

    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    if payload.status is not None:
        user.status = payload.status
        if payload.status != UserStatus.ACTIVE:
            await revoke_all_sessions(session, user.id)
    if payload.organization_public_id is not None:
        organization = await get_organization_by_public_id(session, payload.organization_public_id)
        if organization is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        membership.organization_id = organization.id
        membership.tenant_id = organization.tenant_id
    if payload.designation is not None:
        membership.designation = payload.designation or None
    if payload.member_code is not None:
        membership.member_code = payload.member_code or None
    if payload.role_codes is not None:
        role_codes = sorted(set(payload.role_codes))
        if not role_codes or not set(role_codes).issubset(PLATFORM_ROLES):
            raise HTTPException(status_code=400, detail="At least one platform or police role is required")
        roles = await get_roles_by_codes(session, role_codes)
        await session.execute(delete(MembershipRole).where(MembershipRole.membership_id == membership.id))
        for role_item in roles:
            session.add(MembershipRole(membership_id=membership.id, role_id=role_item.id))

    user.updated_by_id = actor.id
    await write_audit_log(
        session,
        tenant_id=membership.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=membership.organization_id,
        action="platform_staff.updated",
        resource_type="user",
        resource_public_id=user.public_id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={
            "status": previous.status.value,
            "roles": previous.role_codes,
            "organization": previous.organization_code,
        },
        new_values={
            "status": user.status.value,
            "roles": payload.role_codes or previous.role_codes,
            "organization_public_id": str(payload.organization_public_id or previous.organization_public_id),
        },
        reason=payload.reason,
    )
    await session.commit()
    await session.refresh(user)
    return await build_staff_summary(session, user)
