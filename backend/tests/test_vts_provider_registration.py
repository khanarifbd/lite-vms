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
async def provider_api(
    tmp_path: Path,
) -> AsyncIterator[tuple[AsyncClient, dict[str, str]]]:
    database_path = tmp_path / "providers.db"
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

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_response = await client.post(
            "/api/v1/auth/login",
            data={"username": "admin@example.com", "password": "Admin-Password-123"},
        )
        assert login_response.status_code == 200
        headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
        yield client, headers

    app.dependency_overrides.pop(get_session, None)
    await engine.dispose()


def registration_payload(*, suffix: str = "001") -> dict[str, object]:
    return {
        "legal_name": f"ABC Vehicle Tracking Limited {suffix}",
        "trade_name": f"ABC VTS {suffix}",
        "btrc_license_number": f"BTRC-VTS-2026-{suffix}",
        "trade_license_number": f"TRAD-DHK-2026-{suffix}",
        "company_registration_number": f"RJSC-C-{suffix}",
        "tin_number": f"TIN-{suffix}",
        "bin_number": f"BIN-{suffix}",
        "registered_address": "Dhaka, Bangladesh",
        "district": "Dhaka",
        "website_url": f"https://abcvts-{suffix}.example",
        "technical_contact_name": "ABC Technical Team",
        "technical_contact_email": f"tech-{suffix}@abcvts.example",
        "technical_contact_mobile": "+8801812345678",
        "api_base_url": f"https://api-{suffix}.abcvts.example",
        "estimated_vehicle_count": 25000,
        "current_platform_name": "ABC Tracking Cloud",
        "data_submission_interval_seconds": 10,
        "allowed_server_ips": ["203.0.113.10", "2001:db8::10"],
        "documents": [
            {
                "document_type": "btrc_license",
                "document_number": f"BTRC-VTS-2026-{suffix}",
                "file_name": "btrc-license.pdf",
                "file_url": "https://files.example/btrc-license.pdf",
                "expires_at": None,
            },
            {
                "document_type": "trade_license",
                "document_number": f"TRAD-DHK-2026-{suffix}",
                "file_name": "trade-license.pdf",
                "file_url": "https://files.example/trade-license.pdf",
                "expires_at": None,
            },
        ],
        "declaration_accepted": True,
    }


async def signup_applicant(
    client: AsyncClient,
    *,
    email: str,
    mobile: str,
    full_name: str,
    password: str,
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "mobile": mobile,
            "full_name": full_name,
            "password": password,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def login(
    client: AsyncClient,
    *,
    username: str,
    password: str,
) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": password},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
async def test_user_signup_then_provider_application_review_and_approval(
    provider_api: tuple[AsyncClient, dict[str, str]],
) -> None:
    client, admin_headers = provider_api

    await signup_applicant(
        client,
        email="admin@abcvts.example",
        mobile="+8801712345678",
        full_name="ABC VTS Administrator",
        password="VTS-Password-123",
    )
    applicant_headers = await login(
        client,
        username="admin@abcvts.example",
        password="VTS-Password-123",
    )

    no_provider = await client.get("/api/v1/providers/me", headers=applicant_headers)
    assert no_provider.status_code == 404

    registration = await client.post(
        "/api/v1/providers/register",
        headers=applicant_headers,
        json=registration_payload(),
    )
    assert registration.status_code == 201, registration.text
    registered = registration.json()
    provider_id = registered["provider"]["id"]
    assert registered["provider"]["status"] == "pending"
    assert registered["provider"]["contact_person"] == "ABC VTS Administrator"
    assert registered["provider"]["email"] == "admin@abcvts.example"
    assert registered["provider"]["phone"] == "+8801712345678"
    assert registered["provider"]["allowed_server_ips"] == [
        "2001:db8::10",
        "203.0.113.10",
    ]
    assert len(registered["provider"]["documents"]) == 2

    my_application = await client.get("/api/v1/providers/me", headers=applicant_headers)
    assert my_application.status_code == 200
    assert my_application.json()["id"] == provider_id

    duplicate_for_same_user = await client.post(
        "/api/v1/providers/register",
        headers=applicant_headers,
        json=registration_payload(suffix="002"),
    )
    assert duplicate_for_same_user.status_code == 409

    rejected = await client.post(
        f"/api/v1/providers/{provider_id}/review",
        headers=admin_headers,
        json={"decision": "reject", "notes": "Update the API endpoint"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"

    corrected = await client.patch(
        f"/api/v1/providers/{provider_id}",
        headers=applicant_headers,
        json={"api_base_url": "https://new-api.abcvts.example"},
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["status"] == "pending"

    approved = await client.post(
        f"/api/v1/providers/{provider_id}/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "Documents verified"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert all(document["status"] == "verified" for document in approved.json()["documents"])


@pytest.mark.asyncio
async def test_super_admin_creates_provider_for_selected_existing_user(
    provider_api: tuple[AsyncClient, dict[str, str]],
) -> None:
    client, admin_headers = provider_api

    applicant = await signup_applicant(
        client,
        email="selected.owner@example.com",
        mobile="+8801912345678",
        full_name="Selected Provider Owner",
        password="Selected-Owner-Password-123",
    )
    target_user_public_id = applicant["user"]["public_id"]
    applicant_headers = await login(
        client,
        username="selected.owner@example.com",
        password="Selected-Owner-Password-123",
    )

    missing_target_user = await client.post(
        "/api/v1/providers/admin-create",
        headers=admin_headers,
        json=registration_payload(suffix="ADM"),
    )
    assert missing_target_user.status_code == 422

    admin_payload = {
        **registration_payload(suffix="ADM"),
        "primary_admin_user_public_id": target_user_public_id,
    }
    forbidden = await client.post(
        "/api/v1/providers/admin-create",
        headers=applicant_headers,
        json=admin_payload,
    )
    assert forbidden.status_code == 403

    created = await client.post(
        "/api/v1/providers/admin-create",
        headers=admin_headers,
        json=admin_payload,
    )
    assert created.status_code == 201, created.text
    provider = created.json()["provider"]
    assert provider["primary_admin_user_public_id"] == target_user_public_id
    assert provider["contact_person"] == "Selected Provider Owner"
    assert provider["email"] == "selected.owner@example.com"
    assert provider["phone"] == "+8801912345678"

    my_provider = await client.get("/api/v1/providers/me", headers=applicant_headers)
    assert my_provider.status_code == 200
    assert my_provider.json()["id"] == provider["id"]

    duplicate_owner = await client.post(
        "/api/v1/providers/admin-create",
        headers=admin_headers,
        json={
            **registration_payload(suffix="ADM2"),
            "primary_admin_user_public_id": target_user_public_id,
        },
    )
    assert duplicate_owner.status_code == 409
