import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.common.enums import IdentifierType, UserRole, UserStatus
from app.core.database import get_session
from app.db.base import Base
from app.main import app
from app.modules.auth import bootstrap as bootstrap_module
from app.modules.auth.model import User, UserIdentifier
from app.modules.auth.service import create_user_identity
from app.modules.iam.service import (
    create_membership,
    get_or_create_system_scope,
    get_roles_by_codes,
    seed_roles_and_permissions,
)


@pytest_asyncio.fixture
async def user_api(
    tmp_path: Path,
) -> AsyncIterator[tuple[AsyncClient, dict[str, str], uuid.UUID, uuid.UUID, uuid.UUID]]:
    database_path = tmp_path / "users.db"
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
        roles = await get_roles_by_codes(session, [UserRole.SUPER_ADMIN.value])
        await create_membership(
            session,
            user_id=admin.id,
            tenant=tenant,
            organization=organization,
            roles=roles,
            approved_by_id=None,
            is_primary=True,
        )
        await session.commit()
        admin_public_id = admin.public_id
        tenant_public_id = tenant.public_id
        organization_public_id = organization.public_id

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_response = await client.post(
            "/api/v1/auth/login",
            data={"username": "admin@example.com", "password": "Admin-Password-123"},
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        yield (
            client,
            headers,
            admin_public_id,
            tenant_public_id,
            organization_public_id,
        )

    app.dependency_overrides.pop(get_session, None)
    await engine.dispose()


@pytest.mark.asyncio
async def test_super_admin_can_manage_user_lifecycle(
    user_api: tuple[AsyncClient, dict[str, str], uuid.UUID, uuid.UUID, uuid.UUID],
) -> None:
    client, headers, _, tenant_public_id, organization_public_id = user_api

    create_response = await client.post(
        "/api/v1/auth/users",
        headers=headers,
        json={
            "email": "vts@example.com",
            "mobile": "+8801712345678",
            "full_name": "VTS Administrator",
            "password": "VTS-Password-123",
            "tenant_public_id": str(tenant_public_id),
            "organization_public_id": str(organization_public_id),
            "role_codes": ["vts_admin"],
            "designation": "VTS Operations Admin",
            "status": "active",
            "must_change_password": False,
        },
    )
    assert create_response.status_code == 201, create_response.text
    created = create_response.json()
    user_public_id = created["public_id"]
    assert created["memberships"][0]["role_codes"] == ["vts_admin"]

    list_response = await client.get(
        "/api/v1/auth/users",
        headers=headers,
        params={"role_code": "vts_admin", "search": "vts"},
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert list_response.json()["items"][0]["public_id"] == user_public_id

    update_response = await client.patch(
        f"/api/v1/auth/users/{user_public_id}",
        headers=headers,
        json={"display_name": "Updated VTS Administrator"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["display_name"] == "Updated VTS Administrator"

    reset_response = await client.post(
        f"/api/v1/auth/users/{user_public_id}/reset-password",
        headers=headers,
        json={
            "new_password": "New-VTS-Password-123",
            "must_change_password": False,
            "reason": "Integration test",
        },
    )
    assert reset_response.status_code == 200

    login_response = await client.post(
        "/api/v1/auth/login",
        data={"username": "vts@example.com", "password": "New-VTS-Password-123"},
    )
    assert login_response.status_code == 200

    delete_response = await client.delete(
        f"/api/v1/auth/users/{user_public_id}",
        headers=headers,
    )
    assert delete_response.status_code == 200

    deleted_response = await client.get(
        f"/api/v1/auth/users/{user_public_id}",
        headers=headers,
    )
    assert deleted_response.status_code == 200
    assert deleted_response.json()["status"] == "deleted"
    assert deleted_response.json()["deleted_at"] is not None


@pytest.mark.asyncio
async def test_password_change_revokes_existing_session(
    user_api: tuple[AsyncClient, dict[str, str], uuid.UUID, uuid.UUID, uuid.UUID],
) -> None:
    client, headers, _, _, _ = user_api

    password_response = await client.post(
        "/api/v1/auth/me/change-password",
        headers=headers,
        json={
            "current_password": "Admin-Password-123",
            "new_password": "Updated-Admin-Password-123",
        },
    )
    assert password_response.status_code == 200

    revoked_response = await client.get("/api/v1/auth/me", headers=headers)
    assert revoked_response.status_code == 401

    login_response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": "admin@example.com",
            "password": "Updated-Admin-Password-123",
        },
    )
    assert login_response.status_code == 200


@pytest.mark.asyncio
async def test_super_admin_cannot_delete_self(
    user_api: tuple[AsyncClient, dict[str, str], uuid.UUID, uuid.UUID, uuid.UUID],
) -> None:
    client, headers, admin_public_id, _, _ = user_api
    response = await client.delete(
        f"/api/v1/auth/users/{admin_public_id}",
        headers=headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_bootstrap_creates_admin_only_when_users_table_is_empty(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "bootstrap.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    monkeypatch.setattr(bootstrap_module, "get_session_factory", lambda: session_factory)
    monkeypatch.setattr(
        bootstrap_module.settings,
        "bootstrap_super_admin_email",
        "first.admin@example.com",
    )
    monkeypatch.setattr(
        bootstrap_module.settings,
        "bootstrap_super_admin_password",
        "Bootstrap-Password-123",
    )
    monkeypatch.setattr(
        bootstrap_module.settings,
        "bootstrap_super_admin_full_name",
        "First Super Admin",
    )

    await bootstrap_module.bootstrap_identity_platform()
    monkeypatch.setattr(
        bootstrap_module.settings,
        "bootstrap_super_admin_email",
        "second.admin@example.com",
    )
    await bootstrap_module.bootstrap_identity_platform()

    async with session_factory() as session:
        count = int(await session.scalar(select(func.count(User.id))) or 0)
        identifier = await session.scalar(
            select(UserIdentifier).where(UserIdentifier.identifier_type == IdentifierType.EMAIL)
        )

    assert count == 1
    assert identifier is not None
    assert identifier.normalized_value == "first.admin@example.com"

    await engine.dispose()
