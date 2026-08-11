from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.common.enums import (
    MembershipStatus,
    OrganizationStatus,
    OrganizationType,
    OwnerType,
    OwnerVerificationStatus,
    ProviderStatus,
    TenantStatus,
    TenantType,
    UserRole,
    UserStatus,
)
from app.core.database import get_session
from app.db.base import Base
from app.main import app
from app.modules.auth.model import OwnerProfile
from app.modules.auth.service import create_user_identity
from app.modules.iam.service import (
    create_membership,
    create_tenant_and_root_organization,
    get_or_create_system_scope,
    get_roles_by_codes,
    seed_roles_and_permissions,
)
from app.modules.owners.enums import (
    OwnerClaimStatus,
    OwnerProviderLinkStatus,
    OwnerProviderRequestSource,
)
from app.modules.owners.model import VehicleOwner, VTSProviderOwnerLink
from app.modules.owners.schema import OwnerDocumentCreate
from app.modules.owners.service import replace_owner_documents
from app.modules.providers.application_service import create_provider_for_user
from app.modules.providers.schema import ProviderDocumentCreate, ProviderRegister


@pytest_asyncio.fixture
async def provider_customer_api(
    tmp_path: Path,
) -> AsyncIterator[tuple[AsyncClient, dict[str, str], dict[str, str], str]]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'customers.db'}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async with session_factory() as session:
        await seed_roles_and_permissions(session)
        system_tenant, system_org = await get_or_create_system_scope(session)
        admin = await create_user_identity(
            session,
            email="admin@example.com",
            mobile=None,
            display_name="Platform Admin",
            password="Admin-Password-123",
            status=UserStatus.ACTIVE,
            created_by_id=None,
        )
        super_roles = await get_roles_by_codes(session, [UserRole.SUPER_ADMIN.value])
        await create_membership(
            session,
            user_id=admin.id,
            tenant=system_tenant,
            organization=system_org,
            roles=super_roles,
            approved_by_id=None,
            is_primary=True,
        )

        provider_user = await create_user_identity(
            session,
            email="provider@example.com",
            mobile="+8801711111111",
            display_name="Provider Administrator",
            password="Provider-Password-123",
            status=UserStatus.ACTIVE,
            created_by_id=admin.id,
        )
        applicant_roles = await get_roles_by_codes(
            session,
            [UserRole.VTS_APPLICANT.value],
        )
        await create_membership(
            session,
            user_id=provider_user.id,
            tenant=system_tenant,
            organization=system_org,
            roles=applicant_roles,
            approved_by_id=admin.id,
            is_primary=True,
        )
        provider = await create_provider_for_user(
            session,
            payload=ProviderRegister(
                legal_name="Customer Management VTS Limited",
                trade_name="Customer VTS",
                btrc_license_number="BTRC-CUSTOMER-001",
                trade_license_number="TRADE-CUSTOMER-001",
                company_registration_number="RJSC-CUSTOMER-001",
                registered_address="Dhaka, Bangladesh",
                district="Dhaka",
                technical_contact_name="Technical Team",
                technical_contact_email="tech@example.com",
                technical_contact_mobile="+8801811111111",
                estimated_vehicle_count=100,
                allowed_server_ips=["203.0.113.50"],
                documents=[
                    ProviderDocumentCreate(
                        document_type="btrc_license",
                        document_number="BTRC-CUSTOMER-001",
                        file_name="btrc.pdf",
                        file_url="https://files.example/btrc.pdf",
                    ),
                    ProviderDocumentCreate(
                        document_type="trade_license",
                        document_number="TRADE-CUSTOMER-001",
                        file_name="trade.pdf",
                        file_url="https://files.example/trade.pdf",
                    ),
                ],
                declaration_accepted=True,
            ),
            primary_admin=provider_user,
            approved_by_user_id=admin.id,
        )
        provider.status = ProviderStatus.APPROVED
        provider_tenant = await session.get(type(system_tenant), provider.tenant_id)
        provider_org = await session.get(type(system_org), provider.root_organization_id)
        assert provider_tenant is not None
        assert provider_org is not None
        provider_tenant.status = TenantStatus.ACTIVE
        provider_org.status = OrganizationStatus.ACTIVE

        owner_tenant, owner_org = await create_tenant_and_root_organization(
            session,
            name="Linked Vehicle Owner",
            tenant_type=TenantType.VEHICLE_OWNER,
            organization_type=OrganizationType.INDIVIDUAL_VEHICLE_OWNER,
            registration_number="19876543210987654",
        )
        owner_tenant.status = TenantStatus.ACTIVE
        owner_org.status = OrganizationStatus.ACTIVE
        owner_user = await create_user_identity(
            session,
            email="owner@example.com",
            mobile="+8801911111111",
            username="linked.owner",
            display_name="Linked Vehicle Owner",
            password="Owner-Password-123",
            status=UserStatus.ACTIVE,
            created_by_id=provider_user.id,
        )
        owner_roles = await get_roles_by_codes(session, [UserRole.VEHICLE_OWNER.value])
        await create_membership(
            session,
            user_id=owner_user.id,
            tenant=owner_tenant,
            organization=owner_org,
            roles=owner_roles,
            approved_by_id=provider_user.id,
            designation="Vehicle Owner",
            is_primary=True,
            status=MembershipStatus.ACTIVE,
        )
        session.add(
            OwnerProfile(
                user_id=owner_user.id,
                owner_type=OwnerType.INDIVIDUAL.value,
                owner_registry_reference="19876543210987654",
            )
        )
        owner = VehicleOwner(
            tenant_id=owner_tenant.id,
            root_organization_id=owner_org.id,
            primary_admin_user_id=owner_user.id,
            created_by_provider_id=provider.id,
            application_number="OWN-CUSTOMER-001",
            owner_code="OWNER-CUSTOMER-001",
            owner_type=OwnerType.INDIVIDUAL,
            claim_status=OwnerClaimStatus.CLAIMED,
            name="Linked Vehicle Owner",
            nid_or_registration="19876543210987654",
            phone="+8801911111111",
            email="owner@example.com",
            address="Gazipur, Bangladesh",
            district="Gazipur",
            declaration_accepted=True,
            declaration_accepted_at=datetime.now(UTC),
            submitted_at=datetime.now(UTC),
            verification_status=OwnerVerificationStatus.APPROVED,
        )
        session.add(owner)
        await session.flush()
        await replace_owner_documents(
            session,
            owner_id=owner.id,
            documents=[
                OwnerDocumentCreate(
                    document_type="national_id",
                    document_reference="NID-***-7654",
                    file_name="nid.pdf",
                    file_url="https://files.example/nid.pdf",
                )
            ],
        )
        session.add(
            VTSProviderOwnerLink(
                provider_id=provider.id,
                owner_id=owner.id,
                status=OwnerProviderLinkStatus.ACTIVE,
                requested_by=OwnerProviderRequestSource.PROVIDER,
                requested_by_user_id=provider_user.id,
                requested_at=datetime.now(UTC),
                responded_by_user_id=owner_user.id,
                responded_at=datetime.now(UTC),
            )
        )
        await session.commit()
        owner_id = str(owner.id)

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        provider_login = await client.post(
            "/api/v1/auth/login",
            data={
                "username": "provider@example.com",
                "password": "Provider-Password-123",
            },
        )
        assert provider_login.status_code == 200, provider_login.text
        provider_headers = {"Authorization": f"Bearer {provider_login.json()['access_token']}"}
        owner_login = await client.post(
            "/api/v1/auth/login",
            data={"username": "linked.owner", "password": "Owner-Password-123"},
        )
        assert owner_login.status_code == 200, owner_login.text
        owner_headers = {"Authorization": f"Bearer {owner_login.json()['access_token']}"}
        yield client, provider_headers, owner_headers, owner_id

    app.dependency_overrides.pop(get_session, None)
    await engine.dispose()


@pytest.mark.asyncio
async def test_provider_customer_count_visibility_and_scoped_update(
    provider_customer_api: tuple[AsyncClient, dict[str, str], dict[str, str], str],
) -> None:
    client, provider_headers, owner_headers, owner_id = provider_customer_api

    summary = await client.get(
        "/api/v1/providers/me/owners/summary",
        headers=provider_headers,
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["total"] == 1
    assert summary.json()["active"] == 1
    assert summary.json()["ended"] == 0

    customers = await client.get(
        "/api/v1/providers/me/owners",
        headers=provider_headers,
    )
    assert customers.status_code == 200, customers.text
    assert customers.json()["total"] == 1
    customer = customers.json()["items"][0]
    assert customer["can_manage"] is True
    assert customer["account"] is not None
    values = {item["identifier_type"]: item["value"] for item in customer["account"]["identifiers"]}
    assert values["email"] == "owner@example.com"
    assert values["mobile"] == "+8801911111111"
    assert values["username"] == "linked.owner"

    updated = await client.patch(
        f"/api/v1/providers/me/owners/{owner_id}",
        headers=provider_headers,
        json={
            "registered_address": "Uttara, Dhaka, Bangladesh",
            "district": "Dhaka",
            "display_name": "Managed Vehicle Owner",
            "email": "managed.owner@example.com",
            "mobile": "+8801611111111",
            "username": "managed.owner",
            "preferred_language": "bn",
            "timezone": "Asia/Dhaka",
            "primary_identifier_type": "mobile",
        },
    )
    assert updated.status_code == 200, updated.text
    payload = updated.json()
    assert payload["reverification_required"] is False
    assert payload["customer"]["owner"]["registered_address"] == ("Uttara, Dhaka, Bangladesh")
    assert payload["customer"]["owner"]["email"] == "managed.owner@example.com"
    assert payload["customer"]["owner"]["phone"] == "+8801611111111"
    assert payload["customer"]["account"]["display_name"] == "Managed Vehicle Owner"
    identifiers = payload["customer"]["account"]["identifiers"]
    assert (
        next(item for item in identifiers if item["identifier_type"] == "email")["value"]
        == "managed.owner@example.com"
    )
    assert (
        next(item for item in identifiers if item["identifier_type"] == "mobile")["is_primary"]
        is True
    )
    assert (
        next(item for item in identifiers if item["identifier_type"] == "username")["value"]
        == "managed.owner"
    )

    owner_profile = await client.get("/api/v1/auth/me", headers=owner_headers)
    assert owner_profile.status_code == 200
    assert all("value" not in item for item in owner_profile.json()["identifiers"])

    forbidden_security_update = await client.patch(
        f"/api/v1/providers/me/owners/{owner_id}",
        headers=provider_headers,
        json={"password": "Provider-Must-Not-Set-Owner-Password-123"},
    )
    assert forbidden_security_update.status_code == 422

    delete_attempt = await client.delete(
        f"/api/v1/providers/me/owners/{owner_id}",
        headers=provider_headers,
    )
    assert delete_attempt.status_code == 405
