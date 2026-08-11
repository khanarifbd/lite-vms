import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    MembershipStatus,
    OrganizationStatus,
    OrganizationType,
    TenantStatus,
    TenantType,
    UserRole,
)
from app.modules.iam.model import (
    MembershipRole,
    Organization,
    OrganizationMembership,
    Permission,
    Role,
    RolePermission,
    Tenant,
)

BUILT_IN_PERMISSIONS: dict[str, str] = {
    "platform.manage": "Manage the national platform",
    "tenant.manage": "Manage tenants",
    "organization.manage": "Manage organizations",
    "role.manage": "Manage roles and permissions",
    "user.create": "Create user accounts",
    "user.read": "View user accounts",
    "user.update": "Update user accounts",
    "user.delete": "Disable or delete user accounts",
    "user.reset_password": "Reset user passwords",
    "provider.application.submit": "Submit a VTS provider application",
    "provider.staff.read": "View staff within the current VTS provider",
    "provider.staff.manage": "Create and manage staff within the current VTS provider",
    "owner.application.read": "View vehicle-owner applications",
    "owner.application.update": "Update a vehicle-owner application",
    "owner.application.review": "Review vehicle-owner applications",
    "vehicle.create": "Register vehicles",
    "vehicle.read": "View vehicles",
    "vehicle.update": "Update vehicles",
    "vehicle.review": "Review vehicle registrations",
    "tracking.read": "View vehicle tracking assignments",
    "tracking.request": "Request a VTS or owner-managed tracking connection",
    "tracking.confirm": "Confirm a VTS provider device connection",
    "tracking.review": "Review owner-managed GPS devices",
    "device.register": "Register owner-managed GPS devices",
    "device.test": "Submit GPS device test telemetry",
    "driver.create": "Create drivers",
    "driver.read": "View drivers",
    "driver.update": "Update linked drivers",
    "driver.review": "Review driver identity and BRTA licence",
    "driver.link": "Manage driver organization links",
    "driver.assign": "Assign drivers",
    "telemetry.ingest": "Submit approved telemetry-source data",
    "violation.read": "View violation candidates",
    "violation.review": "Review violation candidates",
    "case.approve": "Approve official cases",
    "qr.verify": "Verify vehicles using QR",
    "audit.read": "View audit logs",
}

BUILT_IN_ROLES: dict[str, tuple[str, set[str]]] = {
    UserRole.SUPER_ADMIN.value: (
        "Super Administrator",
        set(BUILT_IN_PERMISSIONS),
    ),
    UserRole.POLICE_ADMIN.value: (
        "Police Administrator",
        {
            "organization.manage",
            "user.create",
            "user.read",
            "user.update",
            "user.reset_password",
            "owner.application.read",
            "owner.application.review",
            "vehicle.read",
            "vehicle.review",
            "tracking.read",
            "tracking.review",
            "driver.read",
            "driver.review",
            "violation.read",
            "violation.review",
            "case.approve",
            "qr.verify",
            "audit.read",
        },
    ),
    UserRole.POLICE_OFFICER.value: (
        "Police Officer",
        {
            "owner.application.read",
            "vehicle.read",
            "tracking.read",
            "driver.read",
            "violation.read",
            "violation.review",
            "qr.verify",
        },
    ),
    UserRole.VTS_APPLICANT.value: (
        "VTS Provider Applicant",
        {"provider.application.submit"},
    ),
    UserRole.VTS_ADMIN.value: (
        "VTS Administrator",
        {
            "provider.staff.read",
            "provider.staff.manage",
            "user.read",
            "owner.application.read",
            "owner.application.update",
            "vehicle.create",
            "vehicle.read",
            "vehicle.update",
            "tracking.read",
            "tracking.confirm",
            "driver.create",
            "driver.read",
            "driver.update",
            "driver.link",
            "driver.assign",
            "telemetry.ingest",
        },
    ),
    UserRole.VTS_OPERATOR.value: (
        "VTS Operations Officer",
        {
            "provider.staff.read",
            "owner.application.read",
            "owner.application.update",
            "vehicle.create",
            "vehicle.read",
            "vehicle.update",
            "tracking.read",
            "tracking.confirm",
            "driver.create",
            "driver.read",
            "driver.update",
            "driver.link",
            "driver.assign",
        },
    ),
    UserRole.VTS_TECHNICAL.value: (
        "VTS Technical Officer",
        {
            "provider.staff.read",
            "vehicle.read",
            "tracking.read",
            "tracking.confirm",
            "telemetry.ingest",
        },
    ),
    UserRole.VTS_VIEWER.value: (
        "VTS Read-only Viewer",
        {
            "provider.staff.read",
            "owner.application.read",
            "vehicle.read",
            "tracking.read",
            "driver.read",
        },
    ),
    UserRole.DRIVER.value: (
        "Registered Driver",
        {"driver.read", "driver.update", "driver.link"},
    ),
    UserRole.VEHICLE_OWNER.value: (
        "Vehicle Owner",
        {
            "owner.application.read",
            "owner.application.update",
            "vehicle.create",
            "vehicle.read",
            "vehicle.update",
            "tracking.read",
            "tracking.request",
            "device.register",
            "device.test",
            "driver.create",
            "driver.read",
            "driver.assign",
            "telemetry.ingest",
        },
    ),
}


def slug_code(value: str, *, prefix: str = "ORG") -> str:
    normalized = re.sub(r"[^A-Za-z0-9]+", "-", value.strip()).strip("-").upper()
    return (normalized[:48] or prefix) + "-" + uuid.uuid4().hex[:8].upper()


async def seed_roles_and_permissions(session: AsyncSession) -> None:
    permissions: dict[str, Permission] = {}
    for code, name in BUILT_IN_PERMISSIONS.items():
        permission = await session.scalar(select(Permission).where(Permission.code == code))
        if permission is None:
            permission = Permission(code=code, name=name)
            session.add(permission)
            await session.flush()
        permissions[code] = permission

    for code, (name, permission_codes) in BUILT_IN_ROLES.items():
        role = await session.scalar(select(Role).where(Role.code == code))
        if role is None:
            role = Role(code=code, name=name, is_system=True, is_active=True)
            session.add(role)
            await session.flush()
        for permission_code in permission_codes:
            permission = permissions[permission_code]
            existing = await session.scalar(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == permission.id,
                )
            )
            if existing is None:
                session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await session.flush()


async def get_or_create_system_scope(session: AsyncSession) -> tuple[Tenant, Organization]:
    tenant = await session.scalar(select(Tenant).where(Tenant.code == "SYSTEM"))
    if tenant is None:
        tenant = Tenant(
            code="SYSTEM",
            name="National Vehicle Platform",
            tenant_type=TenantType.SYSTEM,
            status=TenantStatus.ACTIVE,
        )
        session.add(tenant)
        await session.flush()

    organization = await session.scalar(
        select(Organization).where(
            Organization.tenant_id == tenant.id,
            Organization.code == "PLATFORM-HQ",
        )
    )
    if organization is None:
        organization = Organization(
            tenant_id=tenant.id,
            organization_type=OrganizationType.SYSTEM,
            code="PLATFORM-HQ",
            name_en="National Vehicle Platform Headquarters",
            name_bn="জাতীয় যানবাহন প্ল্যাটফর্ম সদর দপ্তর",
            status=OrganizationStatus.ACTIVE,
        )
        session.add(organization)
        await session.flush()
    return tenant, organization


async def create_tenant_and_root_organization(
    session: AsyncSession,
    *,
    name: str,
    tenant_type: TenantType,
    organization_type: OrganizationType,
    code: str | None = None,
    name_bn: str | None = None,
    registration_number: str | None = None,
) -> tuple[Tenant, Organization]:
    tenant_code = code or slug_code(name, prefix="TENANT")
    tenant = Tenant(
        code=tenant_code,
        name=name.strip(),
        tenant_type=tenant_type,
        status=TenantStatus.ACTIVE,
    )
    session.add(tenant)
    await session.flush()
    organization = Organization(
        tenant_id=tenant.id,
        organization_type=organization_type,
        code="ROOT",
        name_en=name.strip(),
        name_bn=name_bn,
        registration_number=registration_number,
        status=OrganizationStatus.ACTIVE,
    )
    session.add(organization)
    await session.flush()
    return tenant, organization


async def get_tenant_by_public_id(session: AsyncSession, public_id: uuid.UUID) -> Tenant | None:
    return await session.scalar(select(Tenant).where(Tenant.public_id == public_id))


async def get_organization_by_public_id(
    session: AsyncSession, public_id: uuid.UUID
) -> Organization | None:
    return await session.scalar(select(Organization).where(Organization.public_id == public_id))


async def get_roles_by_codes(session: AsyncSession, codes: list[str]) -> list[Role]:
    normalized = sorted({code.strip().lower() for code in codes if code.strip()})
    if not normalized:
        return []
    roles = list(
        await session.scalars(
            select(Role).where(Role.code.in_(normalized), Role.is_active.is_(True))
        )
    )
    if len(roles) != len(normalized):
        found = {role.code for role in roles}
        missing = sorted(set(normalized) - found)
        raise ValueError(f"Unknown or inactive roles: {', '.join(missing)}")
    return roles


async def create_membership(
    session: AsyncSession,
    *,
    user_id: int,
    tenant: Tenant,
    organization: Organization,
    roles: list[Role],
    approved_by_id: int | None,
    member_code: str | None = None,
    designation: str | None = None,
    is_primary: bool = True,
    status: MembershipStatus = MembershipStatus.ACTIVE,
) -> OrganizationMembership:
    now = datetime.now(UTC)
    membership = OrganizationMembership(
        user_id=user_id,
        tenant_id=tenant.id,
        organization_id=organization.id,
        status=status,
        member_code=member_code,
        designation=designation,
        valid_from=now,
        is_primary=is_primary,
        approved_by_id=approved_by_id,
        approved_at=now if approved_by_id else None,
    )
    session.add(membership)
    await session.flush()
    for role in roles:
        session.add(MembershipRole(membership_id=membership.id, role_id=role.id))
    await session.flush()
    return membership


async def get_active_role_codes_for_user(session: AsyncSession, user_id: int) -> set[str]:
    rows = await session.scalars(
        select(Role.code)
        .join(MembershipRole, MembershipRole.role_id == Role.id)
        .join(
            OrganizationMembership,
            OrganizationMembership.id == MembershipRole.membership_id,
        )
        .where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
            Role.is_active.is_(True),
        )
    )
    return set(rows)


async def get_active_permission_codes_for_user(session: AsyncSession, user_id: int) -> set[str]:
    rows = await session.scalars(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(MembershipRole, MembershipRole.role_id == Role.id)
        .join(
            OrganizationMembership,
            OrganizationMembership.id == MembershipRole.membership_id,
        )
        .where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
            Role.is_active.is_(True),
        )
    )
    return set(rows)
