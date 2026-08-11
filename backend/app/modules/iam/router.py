import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User
from app.modules.iam.model import (
    Organization,
    Permission,
    Role,
    RolePermission,
    Tenant,
)
from app.modules.iam.schema import (
    OrganizationCreate,
    OrganizationRead,
    PermissionRead,
    RoleCreate,
    RoleRead,
    RoleUpdate,
    TenantCreate,
    TenantRead,
)
from app.modules.iam.service import get_organization_by_public_id, get_tenant_by_public_id

router = APIRouter(prefix="/iam", tags=["Identity & Tenancy"])


def tenant_read(tenant: Tenant) -> TenantRead:
    return TenantRead(
        public_id=tenant.public_id,
        code=tenant.code,
        name=tenant.name,
        tenant_type=tenant.tenant_type,
        status=tenant.status,
    )


async def organization_read(session: AsyncSession, item: Organization) -> OrganizationRead:
    tenant = await session.get(Tenant, item.tenant_id)
    parent = await session.get(Organization, item.parent_id) if item.parent_id else None
    if tenant is None:
        raise RuntimeError("Organization tenant is missing")
    return OrganizationRead(
        public_id=item.public_id,
        tenant_public_id=tenant.public_id,
        parent_public_id=parent.public_id if parent else None,
        organization_type=item.organization_type,
        code=item.code,
        name_en=item.name_en,
        name_bn=item.name_bn,
        registration_number=item.registration_number,
        status=item.status,
    )


async def role_read(session: AsyncSession, role: Role) -> RoleRead:
    permissions = list(
        await session.scalars(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role.id)
            .order_by(Permission.code)
        )
    )
    return RoleRead(
        public_id=role.public_id,
        code=role.code,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        permission_codes=permissions,
    )


@router.get("/tenants", response_model=list[TenantRead])
async def list_tenants(
    _: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TenantRead]:
    tenants = list(await session.scalars(select(Tenant).order_by(Tenant.name)))
    return [tenant_read(item) for item in tenants]


@router.post("/tenants", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    payload: TenantCreate,
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TenantRead:
    tenant = Tenant(**payload.model_dump())
    session.add(tenant)
    try:
        await session.commit()
        await session.refresh(tenant)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Tenant code already exists") from None
    return tenant_read(tenant)


@router.get("/organizations", response_model=list[OrganizationRead])
async def list_organizations(
    _: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_public_id: Annotated[uuid.UUID | None, Query()] = None,
) -> list[OrganizationRead]:
    query = select(Organization).order_by(Organization.name_en)
    if tenant_public_id:
        tenant = await get_tenant_by_public_id(session, tenant_public_id)
        if tenant is None:
            raise HTTPException(status_code=404, detail="Tenant not found")
        query = query.where(Organization.tenant_id == tenant.id)
    organizations = list(await session.scalars(query))
    return [await organization_read(session, item) for item in organizations]


@router.post(
    "/organizations",
    response_model=OrganizationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_organization(
    payload: OrganizationCreate,
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OrganizationRead:
    tenant = await get_tenant_by_public_id(session, payload.tenant_public_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    parent = None
    if payload.parent_public_id:
        parent = await get_organization_by_public_id(session, payload.parent_public_id)
        if parent is None or parent.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Parent organization is invalid")
    organization = Organization(
        tenant_id=tenant.id,
        parent_id=parent.id if parent else None,
        organization_type=payload.organization_type,
        code=payload.code.upper(),
        name_en=payload.name_en,
        name_bn=payload.name_bn,
        registration_number=payload.registration_number,
        status=payload.status,
    )
    session.add(organization)
    try:
        await session.commit()
        await session.refresh(organization)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="Organization code already exists in tenant"
        ) from None
    return await organization_read(session, organization)


@router.get("/permissions", response_model=list[PermissionRead])
async def list_permissions(
    _: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[PermissionRead]:
    items = list(await session.scalars(select(Permission).order_by(Permission.code)))
    return [
        PermissionRead(
            public_id=item.public_id,
            code=item.code,
            name=item.name,
            description=item.description,
        )
        for item in items
    ]


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(
    _: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[RoleRead]:
    roles = list(await session.scalars(select(Role).order_by(Role.code)))
    return [await role_read(session, item) for item in roles]


@router.post("/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreate,
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleRead:
    permissions = list(
        await session.scalars(
            select(Permission).where(Permission.code.in_(payload.permission_codes))
        )
    )
    if len(permissions) != len(set(payload.permission_codes)):
        raise HTTPException(status_code=400, detail="One or more permission codes are invalid")
    role = Role(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        is_system=False,
        is_active=True,
    )
    session.add(role)
    try:
        await session.flush()
        for permission in permissions:
            session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        await session.commit()
        await session.refresh(role)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Role code already exists") from None
    return await role_read(session, role)


@router.patch("/roles/{role_public_id}", response_model=RoleRead)
async def update_role(
    role_public_id: uuid.UUID,
    payload: RoleUpdate,
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleRead:
    role = await session.scalar(select(Role).where(Role.public_id == role_public_id))
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    if payload.name is not None:
        role.name = payload.name
    if payload.description is not None:
        role.description = payload.description
    if payload.is_active is not None:
        if role.code == UserRole.SUPER_ADMIN.value and not payload.is_active:
            raise HTTPException(status_code=400, detail="Super-admin role cannot be disabled")
        role.is_active = payload.is_active
    if payload.permission_codes is not None:
        if role.is_system:
            raise HTTPException(status_code=400, detail="System-role permissions are immutable")
        permissions = list(
            await session.scalars(
                select(Permission).where(Permission.code.in_(payload.permission_codes))
            )
        )
        if len(permissions) != len(set(payload.permission_codes)):
            raise HTTPException(status_code=400, detail="One or more permission codes are invalid")
        await session.execute(delete(RolePermission).where(RolePermission.role_id == role.id))
        for permission in permissions:
            session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await session.commit()
    await session.refresh(role)
    return await role_read(session, role)
