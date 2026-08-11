import logging

from sqlalchemy import func, select

from app.common.enums import UserRole, UserStatus
from app.core.config import settings
from app.core.database import get_session_factory
from app.modules.auth.model import User
from app.modules.auth.service import create_user_identity
from app.modules.iam.service import (
    create_membership,
    get_or_create_system_scope,
    get_roles_by_codes,
    seed_roles_and_permissions,
)

logger = logging.getLogger(__name__)


async def bootstrap_identity_platform() -> None:
    session_factory = get_session_factory()
    async with session_factory() as session:
        await seed_roles_and_permissions(session)
        tenant, organization = await get_or_create_system_scope(session)
        user_count = int(await session.scalar(select(func.count(User.id))) or 0)

        if user_count == 0:
            email = settings.bootstrap_super_admin_email.strip().lower()
            password = settings.bootstrap_super_admin_password
            if not email or not password:
                raise RuntimeError(
                    "The database has no users. Set BOOTSTRAP_SUPER_ADMIN_EMAIL and "
                    "BOOTSTRAP_SUPER_ADMIN_PASSWORD in .env before starting the server."
                )
            user = await create_user_identity(
                session,
                email=email,
                mobile=None,
                display_name=settings.bootstrap_super_admin_full_name,
                password=password,
                status=UserStatus.ACTIVE,
                created_by_id=None,
                must_change_password=False,
            )
            roles = await get_roles_by_codes(session, [UserRole.SUPER_ADMIN.value])
            await create_membership(
                session,
                user_id=user.id,
                tenant=tenant,
                organization=organization,
                roles=roles,
                approved_by_id=None,
                designation="Platform Super Administrator",
                is_primary=True,
            )
            logger.info("Initial super-admin account created for %s", email)

        await session.commit()


# Backward-compatible startup name used by app.main.
bootstrap_super_admin = bootstrap_identity_platform
