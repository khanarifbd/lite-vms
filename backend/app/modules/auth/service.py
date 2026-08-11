import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import IdentifierType, MembershipStatus, UserRole, UserStatus
from app.modules.auth.model import User, UserIdentifier, UserSecurity, UserSession
from app.modules.auth.schema import IdentifierRead, MembershipRead, UserRead, normalize_username
from app.modules.auth.security import hash_password, verify_password
from app.modules.iam.model import MembershipRole, Organization, OrganizationMembership, Role, Tenant


def mask_email(value: str) -> str:
    local, domain = value.split("@", 1)
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}{'*' * max(2, len(local) - len(visible))}@{domain}"


def mask_mobile(value: str) -> str:
    return f"{'*' * max(0, len(value) - 4)}{value[-4:]}"


def mask_username(value: str) -> str:
    if len(value) <= 3:
        return value[0] + "*" * (len(value) - 1)
    return f"{value[:2]}{'*' * max(2, len(value) - 3)}{value[-1:]}"


def normalize_identifier(value: str) -> tuple[IdentifierType, str]:
    normalized = value.strip()
    if "@" in normalized:
        return IdentifierType.EMAIL, normalized.lower()
    mobile = "".join(
        character for character in normalized if character.isdigit() or character == "+"
    )
    if mobile.startswith("01") and len(mobile) == 11:
        mobile = "+88" + mobile
    if mobile.startswith("+") and 10 <= len(mobile) <= 16:
        return IdentifierType.MOBILE, mobile
    return IdentifierType.USERNAME, normalize_username(normalized)


async def get_user_by_public_id(session: AsyncSession, public_id: uuid.UUID) -> User | None:
    return await session.scalar(select(User).where(User.public_id == public_id))


async def get_identifier(
    session: AsyncSession,
    *,
    identifier_type: IdentifierType,
    normalized_value: str,
) -> UserIdentifier | None:
    return await session.scalar(
        select(UserIdentifier).where(
            UserIdentifier.identifier_type == identifier_type,
            UserIdentifier.normalized_value == normalized_value,
            UserIdentifier.disabled_at.is_(None),
        )
    )


async def get_user_by_login_identifier(
    session: AsyncSession, identifier: str
) -> tuple[User, UserIdentifier] | None:
    identifier_type, normalized_value = normalize_identifier(identifier)
    row = await session.execute(
        select(User, UserIdentifier)
        .join(UserIdentifier, UserIdentifier.user_id == User.id)
        .where(
            UserIdentifier.identifier_type == identifier_type,
            UserIdentifier.normalized_value == normalized_value,
            UserIdentifier.disabled_at.is_(None),
            User.deleted_at.is_(None),
        )
    )
    result = row.first()
    return (result[0], result[1]) if result else None


async def get_security(session: AsyncSession, user_id: int) -> UserSecurity | None:
    return await session.scalar(select(UserSecurity).where(UserSecurity.user_id == user_id))


async def create_user_identity(
    session: AsyncSession,
    *,
    email: str,
    mobile: str | None,
    username: str | None = None,
    display_name: str,
    password: str,
    status: UserStatus,
    created_by_id: int | None,
    must_change_password: bool = False,
) -> User:
    normalized_username = normalize_username(username) if username else None
    if normalized_username:
        existing_username = await get_identifier(
            session,
            identifier_type=IdentifierType.USERNAME,
            normalized_value=normalized_username,
        )
        if existing_username is not None:
            raise ValueError("Username already registered")

    existing_email = await get_identifier(
        session,
        identifier_type=IdentifierType.EMAIL,
        normalized_value=email.strip().lower(),
    )
    if existing_email is not None:
        raise ValueError("Email already registered")
    if mobile:
        existing_mobile = await get_identifier(
            session,
            identifier_type=IdentifierType.MOBILE,
            normalized_value=mobile,
        )
        if existing_mobile is not None:
            raise ValueError("Mobile number already registered")

    user = User(
        display_name=display_name.strip(),
        status=status,
        created_by_id=created_by_id,
        updated_by_id=created_by_id,
    )
    session.add(user)
    await session.flush()

    if normalized_username:
        session.add(
            UserIdentifier(
                user_id=user.id,
                identifier_type=IdentifierType.USERNAME,
                normalized_value=normalized_username,
                masked_value=mask_username(normalized_username),
                is_primary=True,
                is_verified=True,
                verified_at=datetime.now(UTC),
                verification_method="assigned_by_authorized_user",
            )
        )
    session.add(
        UserIdentifier(
            user_id=user.id,
            identifier_type=IdentifierType.EMAIL,
            normalized_value=email.strip().lower(),
            masked_value=mask_email(email.strip().lower()),
            is_primary=normalized_username is None,
            is_verified=False,
        )
    )
    if mobile:
        session.add(
            UserIdentifier(
                user_id=user.id,
                identifier_type=IdentifierType.MOBILE,
                normalized_value=mobile,
                masked_value=mask_mobile(mobile),
                is_primary=False,
                is_verified=False,
            )
        )
    session.add(
        UserSecurity(
            user_id=user.id,
            hashed_password=hash_password(password),
            password_changed_at=datetime.now(UTC),
            must_change_password=must_change_password,
            token_version=1,
        )
    )
    await session.flush()
    return user


async def authenticate_user(
    session: AsyncSession,
    *,
    identifier: str,
    password: str,
    ip_address: str | None,
    user_agent: str | None,
) -> tuple[User, UserIdentifier, UserSecurity] | None:
    found = await get_user_by_login_identifier(session, identifier)
    if found is None:
        return None
    user, login_identifier = found
    security = await get_security(session, user.id)
    if security is None:
        return None

    now = datetime.now(UTC)
    if user.deleted_at is not None:
        return None
    if user.status == UserStatus.LOCKED:
        locked_until = security.locked_until
        if locked_until is not None and locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=UTC)
        # A missing expiry represents an explicit administrative lock. Automated
        # brute-force locks carry a timestamp and continue to expire normally.
        if locked_until is None or locked_until > now:
            return None
        user.status = UserStatus.ACTIVE
        security.locked_until = None
        security.failed_login_count = 0
    elif user.status != UserStatus.ACTIVE:
        return None
    if not verify_password(password, security.hashed_password):
        security.failed_login_count += 1
        if security.failed_login_count >= 5:
            security.locked_until = now + timedelta(minutes=15)
            user.status = UserStatus.LOCKED
        await session.commit()
        return None

    security.failed_login_count = 0
    security.locked_until = None
    security.last_login_at = now
    security.last_login_ip = ip_address
    security.last_login_device = user_agent
    if user.status == UserStatus.LOCKED:
        user.status = UserStatus.ACTIVE
    await session.flush()
    return user, login_identifier, security


async def create_user_session(
    session: AsyncSession,
    *,
    user_id: int,
    token_version: int,
    expires_at: datetime,
    ip_address: str | None,
    user_agent: str | None,
    token_jti: uuid.UUID,
) -> UserSession:
    user_session = UserSession(
        user_id=user_id,
        token_jti=token_jti,
        token_version=token_version,
        issued_at=datetime.now(UTC),
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    session.add(user_session)
    await session.flush()
    return user_session


async def revoke_all_sessions(session: AsyncSession, user_id: int) -> None:
    await session.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def change_password(
    session: AsyncSession,
    *,
    user: User,
    new_password: str,
    must_change_password: bool = False,
) -> None:
    security = await get_security(session, user.id)
    if security is None:
        raise ValueError("User security record not found")
    security.hashed_password = hash_password(new_password)
    security.password_changed_at = datetime.now(UTC)
    security.must_change_password = must_change_password
    security.token_version += 1
    await revoke_all_sessions(session, user.id)
    await session.flush()


async def update_primary_identifier(
    session: AsyncSession,
    *,
    user_id: int,
    identifier_type: IdentifierType,
    value: str,
) -> None:
    existing = await get_identifier(
        session,
        identifier_type=identifier_type,
        normalized_value=value,
    )
    if existing is not None and existing.user_id != user_id:
        raise ValueError(f"{identifier_type.value.title()} already registered")

    current = await session.scalar(
        select(UserIdentifier)
        .where(
            UserIdentifier.user_id == user_id,
            UserIdentifier.identifier_type == identifier_type,
            UserIdentifier.disabled_at.is_(None),
        )
        .order_by(UserIdentifier.is_primary.desc(), UserIdentifier.created_at.asc())
    )
    if existing is not None and existing.user_id == user_id:
        current = existing
    if current is not None and current.normalized_value == value:
        return

    if identifier_type == IdentifierType.EMAIL:
        masked = mask_email(value)
    elif identifier_type == IdentifierType.USERNAME:
        masked = mask_username(value)
    else:
        masked = mask_mobile(value)

    if current is None:
        has_primary = await session.scalar(
            select(UserIdentifier.id).where(
                UserIdentifier.user_id == user_id,
                UserIdentifier.is_primary.is_(True),
                UserIdentifier.disabled_at.is_(None),
            )
        )
        session.add(
            UserIdentifier(
                user_id=user_id,
                identifier_type=identifier_type,
                normalized_value=value,
                masked_value=masked,
                is_primary=has_primary is None,
                is_verified=identifier_type == IdentifierType.USERNAME,
                verified_at=(
                    datetime.now(UTC) if identifier_type == IdentifierType.USERNAME else None
                ),
                verification_method=(
                    "assigned_by_authorized_user"
                    if identifier_type == IdentifierType.USERNAME
                    else None
                ),
            )
        )
    else:
        current.normalized_value = value
        current.masked_value = masked
        if identifier_type == IdentifierType.USERNAME:
            current.is_verified = True
            current.verified_at = datetime.now(UTC)
            current.verification_method = "assigned_by_authorized_user"
        else:
            current.is_verified = False
            current.verified_at = None
            current.verification_method = None
    await session.flush()


async def get_active_super_admin_count(session: AsyncSession) -> int:
    count = await session.scalar(
        select(func.count(func.distinct(User.id)))
        .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
        .join(MembershipRole, MembershipRole.membership_id == OrganizationMembership.id)
        .join(Role, Role.id == MembershipRole.role_id)
        .where(
            User.status == UserStatus.ACTIVE,
            User.deleted_at.is_(None),
            OrganizationMembership.status == MembershipStatus.ACTIVE,
            Role.code == UserRole.SUPER_ADMIN.value,
        )
    )
    return int(count or 0)


async def user_has_role(session: AsyncSession, user_id: int, role_code: str) -> bool:
    result = await session.scalar(
        select(MembershipRole.id)
        .join(Role, Role.id == MembershipRole.role_id)
        .join(OrganizationMembership, OrganizationMembership.id == MembershipRole.membership_id)
        .where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
            Role.code == role_code,
        )
        .limit(1)
    )
    return result is not None


async def build_user_read(session: AsyncSession, user: User) -> UserRead:
    identifier_rows = list(
        await session.scalars(
            select(UserIdentifier)
            .where(UserIdentifier.user_id == user.id, UserIdentifier.disabled_at.is_(None))
            .order_by(UserIdentifier.is_primary.desc(), UserIdentifier.created_at)
        )
    )
    memberships = list(
        await session.scalars(
            select(OrganizationMembership)
            .where(OrganizationMembership.user_id == user.id)
            .order_by(OrganizationMembership.is_primary.desc(), OrganizationMembership.created_at)
        )
    )
    membership_reads: list[MembershipRead] = []
    for membership in memberships:
        tenant = await session.get(Tenant, membership.tenant_id)
        organization = await session.get(Organization, membership.organization_id)
        role_codes = list(
            await session.scalars(
                select(Role.code)
                .join(MembershipRole, MembershipRole.role_id == Role.id)
                .where(MembershipRole.membership_id == membership.id)
                .order_by(Role.code)
            )
        )
        if tenant is None or organization is None:
            continue
        membership_reads.append(
            MembershipRead(
                public_id=membership.public_id,
                tenant_public_id=tenant.public_id,
                tenant_name=tenant.name,
                organization_public_id=organization.public_id,
                organization_name=organization.name_en,
                organization_code=organization.code,
                status=membership.status,
                member_code=membership.member_code,
                designation=membership.designation,
                is_primary=membership.is_primary,
                role_codes=role_codes,
                valid_from=membership.valid_from,
                valid_to=membership.valid_to,
            )
        )

    identifiers_by_type = {
        item.identifier_type: item for item in identifier_rows
    }
    username_identifier = identifiers_by_type.get(IdentifierType.USERNAME)
    email_identifier = identifiers_by_type.get(IdentifierType.EMAIL)
    mobile_identifier = identifiers_by_type.get(IdentifierType.MOBILE)
    security = await get_security(session, user.id)
    primary_membership = next(
        (item for item in membership_reads if item.is_primary),
        membership_reads[0] if membership_reads else None,
    )
    primary_role = (
        primary_membership.role_codes[0]
        if primary_membership and primary_membership.role_codes
        else None
    )

    return UserRead(
        public_id=user.public_id,
        display_name=user.display_name,
        username=username_identifier.normalized_value if username_identifier else None,
        email=email_identifier.normalized_value if email_identifier else None,
        mobile=mobile_identifier.normalized_value if mobile_identifier else None,
        status=user.status,
        preferred_language=user.preferred_language,
        timezone=user.timezone,
        identity_verification_status=user.identity_verification_status,
        identity_assurance_level=user.identity_assurance_level,
        email_verified=email_identifier.is_verified if email_identifier else False,
        mobile_verified=mobile_identifier.is_verified if mobile_identifier else False,
        must_change_password=security.must_change_password if security else False,
        last_login_at=security.last_login_at if security else None,
        primary_role=primary_role,
        primary_tenant_public_id=(
            primary_membership.tenant_public_id if primary_membership else None
        ),
        primary_tenant_name=primary_membership.tenant_name if primary_membership else None,
        identifiers=[
            IdentifierRead(
                public_id=item.public_id,
                identifier_type=item.identifier_type,
                value=item.normalized_value,
                masked_value=item.masked_value,
                is_primary=item.is_primary,
                is_verified=item.is_verified,
                verified_at=item.verified_at,
            )
            for item in identifier_rows
        ],
        memberships=membership_reads,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deleted_at=user.deleted_at,
    )
