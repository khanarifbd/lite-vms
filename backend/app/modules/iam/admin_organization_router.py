import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import OrganizationStatus, OrganizationType, UserRole
from app.core.database import get_session
from app.modules.audit.model import AuditLog
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.iam.model import Organization, OrganizationMembership, Tenant
from app.modules.iam.service import get_organization_by_public_id, get_tenant_by_public_id

router = APIRouter(prefix="/admin/organizations", tags=["Admin organization management"])
AdminUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]
Session = Annotated[AsyncSession, Depends(get_session)]


class OrganizationAdminCreate(BaseModel):
    tenant_public_id: uuid.UUID
    parent_public_id: uuid.UUID | None = None
    organization_type: OrganizationType
    code: str = Field(min_length=2, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    name_en: str = Field(min_length=2, max_length=180)
    name_bn: str | None = Field(default=None, max_length=180)
    registration_number: str | None = Field(default=None, max_length=120)
    status: OrganizationStatus = OrganizationStatus.ACTIVE


class OrganizationAdminUpdate(BaseModel):
    parent_public_id: uuid.UUID | None = None
    organization_type: OrganizationType
    code: str = Field(min_length=2, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    name_en: str = Field(min_length=2, max_length=180)
    name_bn: str | None = Field(default=None, max_length=180)
    registration_number: str | None = Field(default=None, max_length=120)
    status: OrganizationStatus
    change_note: str = Field(min_length=3, max_length=1000)


class OrganizationStatusUpdate(BaseModel):
    status: OrganizationStatus
    change_note: str = Field(min_length=3, max_length=1000)


class OrganizationDeleteRequest(BaseModel):
    change_note: str = Field(min_length=3, max_length=1000)


def snapshot(item: Organization, tenant: Tenant, parent: Organization | None = None) -> dict:
    return {
        "public_id": str(item.public_id),
        "tenant_public_id": str(tenant.public_id),
        "tenant_name": tenant.name,
        "parent_public_id": str(parent.public_id) if parent else None,
        "organization_type": item.organization_type.value,
        "code": item.code,
        "name_en": item.name_en,
        "name_bn": item.name_bn,
        "registration_number": item.registration_number,
        "status": item.status.value,
    }


async def read_item(session: AsyncSession, item: Organization) -> dict:
    tenant = await session.get(Tenant, item.tenant_id)
    parent = await session.get(Organization, item.parent_id) if item.parent_id else None
    if tenant is None:
        raise RuntimeError("Organization tenant is missing")
    return snapshot(item, tenant, parent)


@router.get("")
async def list_organizations(
    _: AdminUser,
    session: Session,
    tenant_public_id: uuid.UUID | None = Query(default=None),
    status_filter: OrganizationStatus | None = Query(default=None, alias="status"),
):
    query = select(Organization).order_by(Organization.name_en)
    if tenant_public_id is not None:
        tenant = await get_tenant_by_public_id(session, tenant_public_id)
        if tenant is None:
            raise HTTPException(status_code=404, detail="Tenant not found")
        query = query.where(Organization.tenant_id == tenant.id)
    if status_filter is not None:
        query = query.where(Organization.status == status_filter)
    items = list(await session.scalars(query))
    return [await read_item(session, item) for item in items]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_organization(payload: OrganizationAdminCreate, user: AdminUser, session: Session):
    tenant = await get_tenant_by_public_id(session, payload.tenant_public_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    parent = None
    if payload.parent_public_id is not None:
        parent = await get_organization_by_public_id(session, payload.parent_public_id)
        if parent is None or parent.tenant_id != tenant.id:
            raise HTTPException(status_code=422, detail="Parent organization must belong to the same tenant")
    item = Organization(
        tenant_id=tenant.id,
        parent_id=parent.id if parent else None,
        organization_type=payload.organization_type,
        code=payload.code.upper(),
        name_en=payload.name_en.strip(),
        name_bn=payload.name_bn.strip() if payload.name_bn else None,
        registration_number=payload.registration_number.strip() if payload.registration_number else None,
        status=payload.status,
    )
    session.add(item)
    try:
        await session.flush()
        session.add(AuditLog(
            tenant_id=tenant.id,
            actor_user_id=user.id,
            action="organization.created",
            resource_type="organization",
            resource_public_id=item.public_id,
            new_values=snapshot(item, tenant, parent),
            reason="Initial organization creation",
        ))
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Organization code already exists in this tenant") from None
    await session.refresh(item)
    return await read_item(session, item)


@router.put("/{organization_public_id}")
async def update_organization(
    organization_public_id: uuid.UUID,
    payload: OrganizationAdminUpdate,
    user: AdminUser,
    session: Session,
):
    item = await get_organization_by_public_id(session, organization_public_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    tenant = await session.get(Tenant, item.tenant_id)
    if tenant is None:
        raise RuntimeError("Organization tenant is missing")
    old_parent = await session.get(Organization, item.parent_id) if item.parent_id else None
    previous_values = snapshot(item, tenant, old_parent)
    parent = None
    if payload.parent_public_id is not None:
        if payload.parent_public_id == item.public_id:
            raise HTTPException(status_code=422, detail="Organization cannot be its own parent")
        parent = await get_organization_by_public_id(session, payload.parent_public_id)
        if parent is None or parent.tenant_id != item.tenant_id:
            raise HTTPException(status_code=422, detail="Parent organization must belong to the same tenant")
    item.parent_id = parent.id if parent else None
    item.organization_type = payload.organization_type
    item.code = payload.code.upper()
    item.name_en = payload.name_en.strip()
    item.name_bn = payload.name_bn.strip() if payload.name_bn else None
    item.registration_number = payload.registration_number.strip() if payload.registration_number else None
    item.status = payload.status
    try:
        await session.flush()
        session.add(AuditLog(
            tenant_id=item.tenant_id,
            actor_user_id=user.id,
            action="organization.updated",
            resource_type="organization",
            resource_public_id=item.public_id,
            previous_values=previous_values,
            new_values=snapshot(item, tenant, parent),
            reason=payload.change_note,
        ))
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Organization update conflicts with existing data") from None
    await session.refresh(item)
    return await read_item(session, item)


@router.patch("/{organization_public_id}/status")
async def update_organization_status(
    organization_public_id: uuid.UUID,
    payload: OrganizationStatusUpdate,
    user: AdminUser,
    session: Session,
):
    item = await get_organization_by_public_id(session, organization_public_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    tenant = await session.get(Tenant, item.tenant_id)
    parent = await session.get(Organization, item.parent_id) if item.parent_id else None
    if tenant is None:
        raise RuntimeError("Organization tenant is missing")
    previous_values = snapshot(item, tenant, parent)
    item.status = payload.status
    await session.flush()
    session.add(AuditLog(
        tenant_id=item.tenant_id,
        actor_user_id=user.id,
        action="organization.status_changed",
        resource_type="organization",
        resource_public_id=item.public_id,
        previous_values=previous_values,
        new_values=snapshot(item, tenant, parent),
        reason=payload.change_note,
    ))
    await session.commit()
    await session.refresh(item)
    return await read_item(session, item)


@router.get("/{organization_public_id}/history")
async def organization_history(organization_public_id: uuid.UUID, _: AdminUser, session: Session):
    item = await get_organization_by_public_id(session, organization_public_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    logs = list(await session.scalars(
        select(AuditLog)
        .where(AuditLog.resource_type == "organization", AuditLog.resource_public_id == organization_public_id)
        .order_by(AuditLog.created_at.desc())
    ))
    return [
        {
            "id": log.id,
            "action": log.action,
            "actor_user_id": log.actor_user_id,
            "previous_values": log.previous_values,
            "new_values": log.new_values,
            "change_note": log.reason,
            "created_at": log.created_at,
        }
        for log in logs
    ]


@router.delete("/{organization_public_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    organization_public_id: uuid.UUID,
    payload: OrganizationDeleteRequest,
    user: AdminUser,
    session: Session,
):
    item = await get_organization_by_public_id(session, organization_public_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    child_id = await session.scalar(select(Organization.id).where(Organization.parent_id == item.id).limit(1))
    membership_id = await session.scalar(
        select(OrganizationMembership.id).where(OrganizationMembership.organization_id == item.id).limit(1)
    )
    if child_id is not None or membership_id is not None:
        raise HTTPException(
            status_code=409,
            detail="Organization has child units or staff memberships. Disable it instead of deleting.",
        )
    tenant = await session.get(Tenant, item.tenant_id)
    parent = await session.get(Organization, item.parent_id) if item.parent_id else None
    if tenant is None:
        raise RuntimeError("Organization tenant is missing")
    previous_values = snapshot(item, tenant, parent)
    session.add(AuditLog(
        tenant_id=item.tenant_id,
        actor_user_id=user.id,
        action="organization.deleted",
        resource_type="organization",
        resource_public_id=item.public_id,
        previous_values=previous_values,
        reason=payload.change_note,
    ))
    await session.delete(item)
    await session.commit()
