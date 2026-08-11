import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    IdentifierType,
    MembershipStatus,
    UserRole,
    UserStatus,
)
from app.core.config import settings
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.admin_schema import UserAdminPage, UserAdminRead
from app.modules.auth.admin_service import build_user_admin_read
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User, UserIdentifier, UserSession
from app.modules.auth.schema import (
    MembershipCreate,
    MembershipUpdate,
    MessageResponse,
    PasswordChange,
    PasswordReset,
    RegistrationResult,
    TokenResponse,
    UserAdminCreate,
    UserRead,
    UserRegister,
    UserSelfUpdate,
    UserUpdate,
)
from app.modules.auth.security import create_access_token, verify_password
from app.modules.auth.service import (
    authenticate_user,
    build_user_read,
    change_password,
    create_user_identity,
    create_user_session,
    get_active_super_admin_count,
    get_security,
    get_user_by_public_id,
    revoke_all_sessions,
    update_primary_identifier,
    user_has_role,
)
from app.modules.iam.model import MembershipRole, OrganizationMembership, Role
from app.modules.iam.service import (
    create_membership,
    get_active_role_codes_for_user,
    get_or_create_system_scope,
    get_organization_by_public_id,
    get_roles_by_codes,
    get_tenant_by_public_id,
)

router = APIRouter(prefix="/auth", tags=["Authentication & Users"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post(
    "/register",
    response_model=RegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: UserRegister,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RegistrationResult:
    if not settings.allow_public_registration:
        raise HTTPException(status_code=403, detail="Public registration is disabled")

    try:
        tenant, organization = await get_or_create_system_scope(session)
        user = await create_user_identity(
            session,
            email=payload.email,
            mobile=payload.mobile,
            display_name=payload.full_name,
            password=payload.password,
            status=UserStatus.ACTIVE,
            created_by_id=None,
        )
        roles = await get_roles_by_codes(session, [UserRole.VTS_APPLICANT.value])
        await create_membership(
            session,
            user_id=user.id,
            tenant=tenant,
            organization=organization,
            roles=roles,
            approved_by_id=None,
            designation="VTS Provider Applicant",
            is_primary=True,
            status=MembershipStatus.ACTIVE,
        )
        await write_audit_log(
            session,
            tenant_id=tenant.id,
            actor_user_id=user.id,
            actor_organization_id=organization.id,
            action="vts_applicant.user_registered",
            resource_type="user",
            resource_public_id=user.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={"role": UserRole.VTS_APPLICANT.value},
        )
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    return RegistrationResult(
        user=await build_user_read(session, user),
        can_login=True,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenResponse:
    authenticated = await authenticate_user(
        session,
        identifier=form_data.username,
        password=form_data.password,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
    )
    if authenticated is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect identifier or password, or the account is unavailable",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user, identifier, security = authenticated
    role_codes = await get_active_role_codes_for_user(session, user.id)
    if not role_codes:
        await session.rollback()
        raise HTTPException(status_code=403, detail="Account has no active organization role")

    session_jti = uuid.uuid4()
    token, expires_at = create_access_token(
        subject=str(user.public_id),
        identifier=identifier.normalized_value,
        role_codes=role_codes,
        token_version=security.token_version,
        session_jti=session_jti,
    )
    login_session = await create_user_session(
        session,
        user_id=user.id,
        token_version=security.token_version,
        expires_at=expires_at,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        token_jti=session_jti,
    )
    await write_audit_log(
        session,
        actor_user_id=user.id,
        action="auth.login",
        resource_type="user_session",
        resource_public_id=login_session.public_id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
    )
    await session.commit()
    return TokenResponse(
        access_token=token,
        expires_in=settings.access_token_expire_minutes * 60,
        session_public_id=login_session.public_id,
        must_change_password=security.must_change_password,
        user=await build_user_read(session, user),
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MessageResponse:
    session_jti = getattr(current_user, "_session_jti", None)
    if session_jti:
        login_session = await session.scalar(
            select(UserSession).where(UserSession.token_jti == session_jti)
        )
        if login_session and login_session.revoked_at is None:
            login_session.revoked_at = datetime.now(UTC)
            await write_audit_log(
                session,
                actor_user_id=current_user.id,
                action="auth.logout",
                resource_type="user_session",
                resource_public_id=login_session.public_id,
                ip_address=request_ip(request),
                user_agent=request_agent(request),
            )
            await session.commit()
    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=UserRead)
async def read_me(
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRead:
    return await build_user_read(session, current_user)


@router.patch("/me", response_model=UserRead)
async def update_me(
    payload: UserSelfUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRead:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    current_user.updated_by_id = current_user.id
    await session.commit()
    await session.refresh(current_user)
    return await build_user_read(session, current_user)


@router.post("/me/change-password", response_model=MessageResponse)
async def change_my_password(
    payload: PasswordChange,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MessageResponse:
    security = await get_security(session, current_user.id)
    if security is None or not verify_password(payload.current_password, security.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if verify_password(payload.new_password, security.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different")
    await change_password(session, user=current_user, new_password=payload.new_password)
    await write_audit_log(
        session,
        actor_user_id=current_user.id,
        action="user.password_changed",
        resource_type="user",
        resource_public_id=current_user.public_id,
    )
    await session.commit()
    return MessageResponse(message="Password changed; all sessions have been revoked")


@router.get("/users", response_model=UserAdminPage)
async def list_users(
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
    search: Annotated[str | None, Query(max_length=180)] = None,
    user_status: Annotated[UserStatus | None, Query(alias="status")] = None,
    role_code: Annotated[str | None, Query(max_length=80)] = None,
    tenant_public_id: Annotated[uuid.UUID | None, Query()] = None,
    include_deleted: bool = False,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> UserAdminPage:
    query = select(User)
    count_query = select(func.count(func.distinct(User.id)))
    if not include_deleted:
        query = query.where(User.deleted_at.is_(None))
        count_query = count_query.where(User.deleted_at.is_(None))
    if user_status:
        query = query.where(User.status == user_status)
        count_query = count_query.where(User.status == user_status)
    if search:
        pattern = f"%{search.strip().lower()}%"
        matching_users = select(UserIdentifier.user_id).where(
            func.lower(UserIdentifier.normalized_value).like(pattern)
        )
        condition = or_(func.lower(User.display_name).like(pattern), User.id.in_(matching_users))
        query = query.where(condition)
        count_query = count_query.where(condition)
    if role_code or tenant_public_id:
        query = query.join(OrganizationMembership, OrganizationMembership.user_id == User.id)
        count_query = count_query.join(
            OrganizationMembership,
            OrganizationMembership.user_id == User.id,
        )
        if tenant_public_id:
            tenant = await get_tenant_by_public_id(session, tenant_public_id)
            if tenant is None:
                raise HTTPException(status_code=404, detail="Tenant not found")
            query = query.where(OrganizationMembership.tenant_id == tenant.id)
            count_query = count_query.where(OrganizationMembership.tenant_id == tenant.id)
        if role_code:
            query = query.join(
                MembershipRole,
                MembershipRole.membership_id == OrganizationMembership.id,
            ).join(Role, Role.id == MembershipRole.role_id)
            count_query = count_query.join(
                MembershipRole,
                MembershipRole.membership_id == OrganizationMembership.id,
            ).join(Role, Role.id == MembershipRole.role_id)
            query = query.where(Role.code == role_code.strip().lower())
            count_query = count_query.where(Role.code == role_code.strip().lower())
    users = list(
        await session.scalars(
            query.distinct().order_by(User.created_at.desc()).offset(offset).limit(limit)
        )
    )
    total = int(await session.scalar(count_query) or 0)
    return UserAdminPage(
        items=[await build_user_admin_read(session, item) for item in users],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/users", response_model=UserAdminRead, status_code=status.HTTP_201_CREATED)
async def create_managed_user(
    payload: UserAdminCreate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserAdminRead:
    tenant = await get_tenant_by_public_id(session, payload.tenant_public_id)
    organization = await get_organization_by_public_id(session, payload.organization_public_id)
    if tenant is None or organization is None or organization.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Tenant or organization is invalid")
    try:
        roles = await get_roles_by_codes(session, payload.role_codes)
        user = await create_user_identity(
            session,
            email=payload.email,
            mobile=payload.mobile,
            display_name=payload.full_name,
            password=payload.password,
            status=payload.status,
            created_by_id=actor.id,
            must_change_password=payload.must_change_password,
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
            action="user.created",
            resource_type="user",
            resource_public_id=user.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={"roles": payload.role_codes, "status": payload.status.value},
        )
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return await build_user_admin_read(session, user)


@router.get("/users/{user_public_id}", response_model=UserAdminRead)
async def get_managed_user(
    user_public_id: uuid.UUID,
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserAdminRead:
    user = await get_user_by_public_id(session, user_public_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return await build_user_admin_read(session, user)


@router.patch("/users/{user_public_id}", response_model=UserAdminRead)
async def update_managed_user(
    user_public_id: uuid.UUID,
    payload: UserUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserAdminRead:
    user = await get_user_by_public_id(session, user_public_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    changes = payload.model_dump(exclude_unset=True)
    if user.id == actor.id and changes.get("status") not in (None, UserStatus.ACTIVE):
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    if (
        changes.get("status") not in (None, UserStatus.ACTIVE)
        and await user_has_role(session, user.id, UserRole.SUPER_ADMIN.value)
        and await get_active_super_admin_count(session) <= 1
    ):
        raise HTTPException(
            status_code=400, detail="The final active super admin cannot be disabled"
        )

    previous = {"display_name": user.display_name, "status": user.status.value}
    if "display_name" in changes:
        user.display_name = changes.pop("display_name")
    email = changes.pop("email", None)
    mobile = changes.pop("mobile", None)
    for field, value in changes.items():
        setattr(user, field, value)
    user.updated_by_id = actor.id
    try:
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
        if user.status != UserStatus.ACTIVE:
            security = await get_security(session, user.id)
            if security:
                security.token_version += 1
            await revoke_all_sessions(session, user.id)
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="user.updated",
            resource_type="user",
            resource_public_id=user.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values=previous,
            new_values=payload.model_dump(exclude_unset=True, mode="json"),
        )
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    await session.refresh(user)
    return await build_user_admin_read(session, user)


@router.post("/users/{user_public_id}/reset-password", response_model=MessageResponse)
async def reset_user_password(
    user_public_id: uuid.UUID,
    payload: PasswordReset,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MessageResponse:
    user = await get_user_by_public_id(session, user_public_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")
    await change_password(
        session,
        user=user,
        new_password=payload.new_password,
        must_change_password=payload.must_change_password,
    )
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action="user.password_reset",
        resource_type="user",
        resource_public_id=user.public_id,
        reason=payload.reason,
    )
    await session.commit()
    return MessageResponse(message="Password reset; all sessions have been revoked")


@router.delete("/users/{user_public_id}", response_model=MessageResponse)
async def delete_managed_user(
    user_public_id: uuid.UUID,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MessageResponse:
    user = await get_user_by_public_id(session, user_public_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == actor.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if (
        await user_has_role(session, user.id, UserRole.SUPER_ADMIN.value)
        and await get_active_super_admin_count(session) <= 1
    ):
        raise HTTPException(
            status_code=400, detail="The final active super admin cannot be deleted"
        )
    now = datetime.now(UTC)
    user.status = UserStatus.DELETED
    user.deleted_at = now
    user.deleted_by_id = actor.id
    user.updated_by_id = actor.id
    await session.execute(
        delete(MembershipRole).where(
            MembershipRole.membership_id.in_(
                select(OrganizationMembership.id).where(OrganizationMembership.user_id == user.id)
            )
        )
    )
    memberships = list(
        await session.scalars(
            select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)
        )
    )
    for membership in memberships:
        membership.status = MembershipStatus.ENDED
        membership.valid_to = now
    identifiers = list(
        await session.scalars(select(UserIdentifier).where(UserIdentifier.user_id == user.id))
    )
    for identifier in identifiers:
        identifier.disabled_at = now
    security = await get_security(session, user.id)
    if security:
        security.token_version += 1
    await revoke_all_sessions(session, user.id)
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action="user.soft_deleted",
        resource_type="user",
        resource_public_id=user.public_id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
    )
    await session.commit()
    return MessageResponse(message="User account has been soft deleted")


@router.post(
    "/users/{user_public_id}/memberships",
    response_model=UserAdminRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_user_membership(
    user_public_id: uuid.UUID,
    payload: MembershipCreate,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserAdminRead:
    user = await get_user_by_public_id(session, user_public_id)
    tenant = await get_tenant_by_public_id(session, payload.tenant_public_id)
    organization = await get_organization_by_public_id(session, payload.organization_public_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if tenant is None or organization is None or organization.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Tenant or organization is invalid")
    try:
        roles = await get_roles_by_codes(session, payload.role_codes)
        await create_membership(
            session,
            user_id=user.id,
            tenant=tenant,
            organization=organization,
            roles=roles,
            approved_by_id=actor.id,
            member_code=payload.member_code,
            designation=payload.designation,
            is_primary=payload.is_primary,
        )
        security = await get_security(session, user.id)
        if security:
            security.token_version += 1
        await revoke_all_sessions(session, user.id)
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return await build_user_admin_read(session, user)


@router.patch(
    "/users/{user_public_id}/memberships/{membership_public_id}",
    response_model=UserAdminRead,
)
async def update_user_membership(
    user_public_id: uuid.UUID,
    membership_public_id: uuid.UUID,
    payload: MembershipUpdate,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserAdminRead:
    user = await get_user_by_public_id(session, user_public_id)
    membership = await session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.public_id == membership_public_id,
            OrganizationMembership.user_id == (user.id if user else -1),
        )
    )
    if user is None or membership is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    changes = payload.model_dump(exclude_unset=True)
    role_codes = changes.pop("role_codes", None)
    if role_codes is not None:
        currently_super = await session.scalar(
            select(MembershipRole.id)
            .join(Role, Role.id == MembershipRole.role_id)
            .where(
                MembershipRole.membership_id == membership.id,
                Role.code == UserRole.SUPER_ADMIN.value,
            )
        )
        removing_final_super = (
            currently_super is not None
            and UserRole.SUPER_ADMIN.value not in role_codes
            and await get_active_super_admin_count(session) <= 1
        )
        if removing_final_super:
            raise HTTPException(
                status_code=400, detail="The final super-admin role cannot be removed"
            )
        roles = await get_roles_by_codes(session, role_codes)
        await session.execute(
            delete(MembershipRole).where(MembershipRole.membership_id == membership.id)
        )
        for role in roles:
            session.add(MembershipRole(membership_id=membership.id, role_id=role.id))
    if changes.get("status") == MembershipStatus.ENDED:
        membership.valid_to = datetime.now(UTC)
    for field, value in changes.items():
        setattr(membership, field, value)
    membership.approved_by_id = actor.id
    membership.approved_at = datetime.now(UTC)
    security = await get_security(session, user.id)
    if security:
        security.token_version += 1
    await revoke_all_sessions(session, user.id)
    await session.commit()
    return await build_user_admin_read(session, user)
