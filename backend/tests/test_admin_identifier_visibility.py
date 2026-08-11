from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.common.enums import UserRole, UserStatus
from app.core.database import get_session
from app.db.base import Base
from app.main import app
from app.modules.auth.service import create_user_identity
from app.modules.iam.service import (
    create_membership,
    get_or_create_system_scope,
    get_roles_by_codes,
    seed_roles_and_permissions,
)


@pytest_asyncio.fixture
async def identifier_visibility_api(
    tmp_path: Path,
) -> AsyncIterator[tuple[AsyncClient, dict[str, str], str]]:
    database_path = tmp_path / "identifier-visibility.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async with session_factory() as session:
        await seed_roles_and_permissions(session)
        tenant, organization = await get_or_create_system_scope(session)

        admin = await create_user_identity(
            session,
            email="admin@example.com",
            mobile=None,
            display_name="Platform Admin",
            password="Admin-Password-123",
            status=UserStatus.ACTIVE,
            created_by_id=None,
        )
        admin_roles = await get_roles_by_codes(session, [UserRole.SUPER_ADMIN.value])
        await create_membership(
            session,
            user_id=admin.id,
            tenant=tenant,
            organization=organization,
            roles=admin_roles,
            approved_by_id=None,
            is_primary=True,
        )

        target = await create_user_identity(
            session,
            email="target@example.com",
            mobile="+8801712345678",
            display_name="Target User",
            password="Target-Password-123",
            status=UserStatus.ACTIVE,
            created_by_id=admin.id,
        )
        applicant_roles = await get_roles_by_codes(
            session,
            [UserRole.VTS_APPLICANT.value],
        )
        await create_membership(
            session,
            user_id=target.id,
            tenant=tenant,
            organization=organization,
            roles=applicant_roles,
            approved_by_id=admin.id,
            is_primary=True,
        )
        target_public_id = str(target.public_id)
        await session.commit()

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        admin_login = await client.post(
            "/api/v1/auth/login",
            data={"username": "admin@example.com", "password": "Admin-Password-123"},
        )
        assert admin_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
        yield client, admin_headers, target_public_id

    app.dependency_overrides.pop(get_session, None)
    await engine.dispose()


@pytest.mark.asyncio
async def test_super_admin_sees_values_but_self_profile_stays_masked(
    identifier_visibility_api: tuple[AsyncClient, dict[str, str], str],
) -> None:
    client, admin_headers, target_public_id = identifier_visibility_api

    managed = await client.get(
        f"/api/v1/auth/users/{target_public_id}",
        headers=admin_headers,
    )
    assert managed.status_code == 200, managed.text
    identifiers = managed.json()["identifiers"]
    email = next(item for item in identifiers if item["identifier_type"] == "email")
    mobile = next(item for item in identifiers if item["identifier_type"] == "mobile")
    assert email["value"] == "target@example.com"
    assert mobile["value"] == "+8801712345678"
    assert email["masked_value"] != email["value"]
    assert mobile["masked_value"] != mobile["value"]

    target_login = await client.post(
        "/api/v1/auth/login",
        data={"username": "target@example.com", "password": "Target-Password-123"},
    )
    assert target_login.status_code == 200
    target_headers = {"Authorization": f"Bearer {target_login.json()['access_token']}"}
    my_profile = await client.get("/api/v1/auth/me", headers=target_headers)
    assert my_profile.status_code == 200
    assert all("value" not in item for item in my_profile.json()["identifiers"])
