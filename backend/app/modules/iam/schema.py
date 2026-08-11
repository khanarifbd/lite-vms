import uuid

from pydantic import BaseModel, Field

from app.common.enums import (
    OrganizationStatus,
    OrganizationType,
    TenantStatus,
    TenantType,
)


class TenantCreate(BaseModel):
    code: str = Field(min_length=2, max_length=60, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=2, max_length=180)
    tenant_type: TenantType
    status: TenantStatus = TenantStatus.ACTIVE


class TenantRead(BaseModel):
    public_id: uuid.UUID
    code: str
    name: str
    tenant_type: TenantType
    status: TenantStatus


class OrganizationCreate(BaseModel):
    tenant_public_id: uuid.UUID
    parent_public_id: uuid.UUID | None = None
    organization_type: OrganizationType
    code: str = Field(min_length=2, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    name_en: str = Field(min_length=2, max_length=180)
    name_bn: str | None = Field(default=None, max_length=180)
    registration_number: str | None = Field(default=None, max_length=120)
    status: OrganizationStatus = OrganizationStatus.ACTIVE


class OrganizationRead(BaseModel):
    public_id: uuid.UUID
    tenant_public_id: uuid.UUID
    parent_public_id: uuid.UUID | None
    organization_type: OrganizationType
    code: str
    name_en: str
    name_bn: str | None
    registration_number: str | None
    status: OrganizationStatus


class PermissionRead(BaseModel):
    public_id: uuid.UUID
    code: str
    name: str
    description: str | None


class RoleCreate(BaseModel):
    code: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9_.-]+$")
    name: str = Field(min_length=2, max_length=140)
    description: str | None = Field(default=None, max_length=500)
    permission_codes: list[str] = []


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=140)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None
    permission_codes: list[str] | None = None


class RoleRead(BaseModel):
    public_id: uuid.UUID
    code: str
    name: str
    description: str | None
    is_system: bool
    is_active: bool
    permission_codes: list[str]
