from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import get_session
from app.db.base import Base
from app.main import app
from app.modules.iam.service import seed_roles_and_permissions


@pytest_asyncio.fixture
async def public_registration_client(tmp_path: Path) -> AsyncIterator[AsyncClient]:
    database_path = tmp_path / "public-registration.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async with session_factory() as session:
        await seed_roles_and_permissions(session)
        await session.commit()

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.pop(get_session, None)
    await engine.dispose()


def owner_payload(*, email: str, identity_reference: str) -> dict[str, object]:
    return {
        "admin_email": email,
        "admin_mobile": None,
        "admin_full_name": "Md Rahim Uddin",
        "password": "Vehicle-Owner-Password-123",
        "owner_type": "individual",
        "owner_name": "Md Rahim Uddin",
        "identity_or_registration_reference": identity_reference,
        "trade_license_number": None,
        "tin_number": None,
        "bin_number": None,
        "registered_address": "Dhaka, Bangladesh",
        "district": "Dhaka",
        "website_url": None,
        "documents": [
            {
                "document_type": "national_id",
                "document_reference": identity_reference,
                "file_name": "identity.pdf",
                "file_url": "https://files.example/identity.pdf",
                "expires_at": None,
            }
        ],
        "declaration_accepted": True,
    }


@pytest.mark.asyncio
async def test_vts_applicant_can_signup_before_provider_application(
    public_registration_client: AsyncClient,
) -> None:
    registration = await public_registration_client.post(
        "/api/v1/auth/register",
        json={
            "email": "provider.applicant@example.com",
            "mobile": "+8801712345678",
            "full_name": "Provider Applicant",
            "password": "Provider-Applicant-Password-123",
        },
    )
    assert registration.status_code == 201, registration.text
    memberships = registration.json()["user"]["memberships"]
    assert memberships[0]["role_codes"] == ["vts_applicant"]

    legacy_owner_role = await public_registration_client.post(
        "/api/v1/auth/register",
        json={
            "email": "legacy-owner@example.com",
            "mobile": "+8801812345678",
            "full_name": "Legacy Vehicle Owner",
            "password": "Legacy-Owner-Password-123",
            "role": "vehicle_owner",
        },
    )
    assert legacy_owner_role.status_code == 422


@pytest.mark.asyncio
async def test_distinct_individuals_may_share_the_same_name(
    public_registration_client: AsyncClient,
) -> None:
    first = await public_registration_client.post(
        "/api/v1/owners/register",
        json=owner_payload(
            email="rahim.one@example.com",
            identity_reference="IDENTITY-REFERENCE-ONE",
        ),
    )
    assert first.status_code == 201, first.text

    second = await public_registration_client.post(
        "/api/v1/owners/register",
        json=owner_payload(
            email="rahim.two@example.com",
            identity_reference="IDENTITY-REFERENCE-TWO",
        ),
    )
    assert second.status_code == 201, second.text
    assert first.json()["owner"]["id"] != second.json()["owner"]["id"]


@pytest.mark.asyncio
async def test_owner_identity_reference_cannot_be_registered_twice(
    public_registration_client: AsyncClient,
) -> None:
    first = await public_registration_client.post(
        "/api/v1/owners/register",
        json=owner_payload(
            email="identity.one@example.com",
            identity_reference="DUPLICATE-IDENTITY-REFERENCE",
        ),
    )
    assert first.status_code == 201, first.text

    duplicate = await public_registration_client.post(
        "/api/v1/owners/register",
        json=owner_payload(
            email="identity.two@example.com",
            identity_reference="DUPLICATE-IDENTITY-REFERENCE",
        ),
    )
    assert duplicate.status_code == 409
