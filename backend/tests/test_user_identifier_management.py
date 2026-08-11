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
async def identifier_api(
    tmp_path: Path,
) -> AsyncIterator[tuple[AsyncClient, dict[str, str], str]]:
    database_path = tmp_path / "identifiers.db"
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
        login_response = await client.post(
            "/api/v1/auth/login",
            data={"username": "admin@example.com", "password": "Admin-Password-123"},
        )
        assert login_response.status_code == 200
        headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
        yield client, headers, target_public_id

    app.dependency_overrides.pop(get_session, None)
    await engine.dispose()


def primary_identifiers(user: dict[str, object]) -> list[dict[str, object]]:
    return [item for item in user["identifiers"] if item["is_primary"]]


@pytest.mark.asyncio
async def test_admin_updates_identifiers_and_switches_global_primary(
    identifier_api: tuple[AsyncClient, dict[str, str], str],
) -> None:
    client, headers, user_public_id = identifier_api

    original = await client.get(
        f"/api/v1/auth/users/{user_public_id}",
        headers=headers,
    )
    assert original.status_code == 200
    original_user = original.json()
    assert len(primary_identifiers(original_user)) == 1
    assert primary_identifiers(original_user)[0]["identifier_type"] == "email"

    same_mobile_update = await client.patch(
        f"/api/v1/auth/users/{user_public_id}",
        headers=headers,
        json={"mobile": "+8801712345678"},
    )
    assert same_mobile_update.status_code == 200, same_mobile_update.text
    same_mobile_user = same_mobile_update.json()
    assert (
        len(
            [
                item
                for item in same_mobile_user["identifiers"]
                if item["identifier_type"] == "mobile"
            ]
        )
        == 1
    )
    assert len(primary_identifiers(same_mobile_user)) == 1
    assert primary_identifiers(same_mobile_user)[0]["identifier_type"] == "email"

    mobile = next(
        item for item in same_mobile_user["identifiers"] if item["identifier_type"] == "mobile"
    )
    make_mobile_primary = await client.post(
        f"/api/v1/auth/users/{user_public_id}/identifiers/{mobile['public_id']}/make-primary",
        headers=headers,
    )
    assert make_mobile_primary.status_code == 200, make_mobile_primary.text
    mobile_primary_user = make_mobile_primary.json()
    assert len(primary_identifiers(mobile_primary_user)) == 1
    assert primary_identifiers(mobile_primary_user)[0]["identifier_type"] == "mobile"

    update_mobile = await client.patch(
        f"/api/v1/auth/users/{user_public_id}/identifiers/{mobile['public_id']}",
        headers=headers,
        json={"value": "+8801812345678"},
    )
    assert update_mobile.status_code == 200, update_mobile.text
    updated_mobile = next(
        item
        for item in update_mobile.json()["identifiers"]
        if item["public_id"] == mobile["public_id"]
    )
    assert updated_mobile["is_primary"] is True
    assert updated_mobile["is_verified"] is False
    assert updated_mobile["masked_value"].endswith("5678")

    add_username = await client.post(
        f"/api/v1/auth/users/{user_public_id}/identifiers",
        headers=headers,
        json={
            "identifier_type": "username",
            "value": "target.user",
            "make_primary": True,
        },
    )
    assert add_username.status_code == 201, add_username.text
    username_user = add_username.json()
    assert len(primary_identifiers(username_user)) == 1
    username = primary_identifiers(username_user)[0]
    assert username["identifier_type"] == "username"
    assert username["is_verified"] is True

    cannot_remove_primary = await client.delete(
        f"/api/v1/auth/users/{user_public_id}/identifiers/{username['public_id']}",
        headers=headers,
    )
    assert cannot_remove_primary.status_code == 409

    email = next(
        item for item in username_user["identifiers"] if item["identifier_type"] == "email"
    )
    make_email_primary = await client.post(
        f"/api/v1/auth/users/{user_public_id}/identifiers/{email['public_id']}/make-primary",
        headers=headers,
    )
    assert make_email_primary.status_code == 200

    remove_username = await client.delete(
        f"/api/v1/auth/users/{user_public_id}/identifiers/{username['public_id']}",
        headers=headers,
    )
    assert remove_username.status_code == 200
    final_user = remove_username.json()
    assert all(item["public_id"] != username["public_id"] for item in final_user["identifiers"])
    assert len(primary_identifiers(final_user)) == 1
    assert primary_identifiers(final_user)[0]["identifier_type"] == "email"
