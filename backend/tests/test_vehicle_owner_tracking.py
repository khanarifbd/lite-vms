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
async def tracking_api(
    tmp_path: Path,
) -> AsyncIterator[tuple[AsyncClient, dict[str, str]]]:
    database_path = tmp_path / "tracking.db"
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


def provider_payload() -> dict[str, object]:
    return {
        "legal_name": "Tracking VTS Limited",
        "trade_name": "Tracking VTS",
        "btrc_license_number": "BTRC-VTS-TRACK-001",
        "trade_license_number": "TRADE-VTS-TRACK-001",
        "company_registration_number": "RJSC-VTS-TRACK-001",
        "tin_number": "TIN-VTS-TRACK-001",
        "bin_number": "BIN-VTS-TRACK-001",
        "registered_address": "Dhaka, Bangladesh",
        "district": "Dhaka",
        "website_url": "https://tracking-vts.example",
        "technical_contact_name": "Tracking Technical Team",
        "technical_contact_email": "tech@tracking-vts.example",
        "technical_contact_mobile": "+8801811111111",
        "api_base_url": "https://api.tracking-vts.example",
        "estimated_vehicle_count": 1000,
        "current_platform_name": "Tracking Cloud",
        "data_submission_interval_seconds": 10,
        "allowed_server_ips": ["203.0.113.20"],
        "documents": [
            {
                "document_type": "btrc_license",
                "document_number": "BTRC-VTS-TRACK-001",
                "file_name": "btrc.pdf",
                "file_url": "https://files.example/btrc.pdf",
                "expires_at": None,
            },
            {
                "document_type": "trade_license",
                "document_number": "TRADE-VTS-TRACK-001",
                "file_name": "trade.pdf",
                "file_url": "https://files.example/trade.pdf",
                "expires_at": None,
            },
        ],
        "declaration_accepted": True,
    }


def shared_owner_details() -> dict[str, object]:
    return {
        "owner_type": "individual",
        "owner_name": "Md Vehicle Owner",
        "identity_or_registration_reference": "19876543210987654",
        "trade_license_number": None,
        "tin_number": None,
        "bin_number": None,
        "registered_address": "Gazipur, Bangladesh",
        "district": "Gazipur",
        "website_url": None,
        "documents": [
            {
                "document_type": "national_id",
                "document_reference": "NID-***-7654",
                "file_name": "nid.pdf",
                "file_url": "https://files.example/nid.pdf",
                "expires_at": None,
            }
        ],
        "declaration_accepted": True,
    }


def owner_self_payload() -> dict[str, object]:
    return {
        **shared_owner_details(),
        "admin_email": "owner@example.com",
        "admin_mobile": "+8801911111111",
        "admin_full_name": "Md Vehicle Owner",
        "password": "Vehicle-Owner-Password-123",
    }


def provider_owner_payload() -> dict[str, object]:
    return {
        **shared_owner_details(),
        "contact_email": "owner@example.com",
        "contact_mobile": "+8801911111111",
        "contact_name": "Md Vehicle Owner",
        "login_username": "vehicle.owner.001",
    }


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
async def test_global_owner_registry_provider_link_and_tracking_lifecycle(
    tracking_api: tuple[AsyncClient, dict[str, str]],
) -> None:
    client, admin_headers = tracking_api

    applicant_registration = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin@tracking-vts.example",
            "mobile": "+8801711111111",
            "full_name": "Tracking VTS Admin",
            "password": "Tracking-VTS-Password-123",
        },
    )
    assert applicant_registration.status_code == 201, applicant_registration.text
    applicant_headers = await login(
        client,
        username="admin@tracking-vts.example",
        password="Tracking-VTS-Password-123",
    )
    provider_registration = await client.post(
        "/api/v1/providers/register",
        headers=applicant_headers,
        json=provider_payload(),
    )
    assert provider_registration.status_code == 201, provider_registration.text
    provider_id = provider_registration.json()["provider"]["id"]
    provider_approval = await client.post(
        f"/api/v1/providers/{provider_id}/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "Provider verified"},
    )
    assert provider_approval.status_code == 200, provider_approval.text
    provider_headers = await login(
        client,
        username="admin@tracking-vts.example",
        password="Tracking-VTS-Password-123",
    )

    missing_lookup = await client.post(
        "/api/v1/owners/lookup",
        headers=provider_headers,
        json={
            "owner_type": "individual",
            "identity_or_registration_reference": "19876543210987654",
        },
    )
    assert missing_lookup.status_code == 200
    assert missing_lookup.json()["exists"] is False
    assert missing_lookup.json()["next_action"] == "complete_owner_registration"

    provider_created = await client.post(
        "/api/v1/owners/provider-register",
        headers=provider_headers,
        json=provider_owner_payload(),
    )
    assert provider_created.status_code == 200, provider_created.text
    created_json = provider_created.json()
    owner_id = created_json["owner"]["id"]
    link_id = created_json["link"]["id"]
    assert created_json["already_registered"] is False
    assert created_json["owner"]["claim_status"] == "pending_claim"
    assert created_json["link"]["status"] == "pending_owner_approval"
    assert created_json["login_username"] == "vehicle.owner.001"
    assert created_json["must_change_password"] is True

    existing_lookup = await client.post(
        "/api/v1/owners/lookup",
        headers=provider_headers,
        json={
            "owner_type": "individual",
            "identity_or_registration_reference": "19876543210987654",
        },
    )
    assert existing_lookup.status_code == 200
    lookup_json = existing_lookup.json()
    assert lookup_json["exists"] is True
    assert lookup_json["owner_id"] == owner_id
    assert lookup_json["current_provider_link_status"] == "pending_owner_approval"
    assert lookup_json["linked_providers"][0]["provider_name"] == "Tracking VTS Limited"

    duplicate_provider_add = await client.post(
        "/api/v1/owners/provider-register",
        headers=provider_headers,
        json=provider_owner_payload(),
    )
    assert duplicate_provider_add.status_code == 200
    assert duplicate_provider_add.json()["already_registered"] is True
    assert duplicate_provider_add.json()["owner"]["id"] == owner_id

    duplicate_owner_registration = await client.post(
        "/api/v1/owners/register",
        json=owner_self_payload(),
    )
    assert duplicate_owner_registration.status_code == 409
    duplicate_detail = duplicate_owner_registration.json()["detail"]
    assert duplicate_detail["code"] == "owner_already_registered"
    assert duplicate_detail["owner_name"] == "Md Vehicle Owner"
    assert duplicate_detail["masked_phone"].endswith("1111")
    assert duplicate_detail["next_action"] == "request_mobile_password_reset"

    unknown_password_login = await client.post(
        "/api/v1/auth/login",
        data={
            "username": "vehicle.owner.001",
            "password": "Temporary-Owner-Password-123",
        },
    )
    assert unknown_password_login.status_code == 401

    wrong_mobile_request = await client.post(
        "/api/v1/owners/password-reset/mobile/request",
        json={
            "identity_or_registration_reference": "19876543210987654",
            "mobile": "+8801911119999",
        },
    )
    assert wrong_mobile_request.status_code == 400

    otp_request = await client.post(
        "/api/v1/owners/password-reset/mobile/request",
        json={
            "identity_or_registration_reference": "19876543210987654",
            "mobile": "+8801911111111",
        },
    )
    assert otp_request.status_code == 202, otp_request.text
    otp_data = otp_request.json()
    assert otp_data["delivery_status"] == "simulated"
    assert otp_data["development_otp"]

    cooldown_request = await client.post(
        "/api/v1/owners/password-reset/mobile/request",
        json={
            "identity_or_registration_reference": "19876543210987654",
            "mobile": "+8801911111111",
        },
    )
    assert cooldown_request.status_code == 429

    wrong_otp = await client.post(
        "/api/v1/owners/password-reset/mobile/confirm",
        json={
            "challenge_id": otp_data["challenge_id"],
            "otp": "000000",
            "new_password": "Vehicle-Owner-Password-123",
        },
    )
    assert wrong_otp.status_code == 400

    reset_password = await client.post(
        "/api/v1/owners/password-reset/mobile/confirm",
        json={
            "challenge_id": otp_data["challenge_id"],
            "otp": otp_data["development_otp"],
            "new_password": "Vehicle-Owner-Password-123",
        },
    )
    assert reset_password.status_code == 200, reset_password.text
    assert reset_password.json()["owner_id"] == owner_id
    assert reset_password.json()["username"] == "vehicle.owner.001"
    assert reset_password.json()["must_change_password"] is False

    reused_otp = await client.post(
        "/api/v1/owners/password-reset/mobile/confirm",
        json={
            "challenge_id": otp_data["challenge_id"],
            "otp": otp_data["development_otp"],
            "new_password": "Another-Owner-Password-123",
        },
    )
    assert reused_otp.status_code == 409

    owner_login = await client.post(
        "/api/v1/auth/login",
        data={
            "username": "vehicle.owner.001",
            "password": "Vehicle-Owner-Password-123",
        },
    )
    assert owner_login.status_code == 200, owner_login.text
    assert owner_login.json()["must_change_password"] is False
    owner_headers = {"Authorization": f"Bearer {owner_login.json()['access_token']}"}

    owner_approval = await client.post(
        f"/api/v1/owners/{owner_id}/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "Identity verified"},
    )
    assert owner_approval.status_code == 200, owner_approval.text

    blocked_vehicle = await client.post(
        "/api/v1/vehicles",
        headers=provider_headers,
        json={
            "owner_id": owner_id,
            "registration_number": "DHAKA-METRO-GA-12-3456",
            "chassis_number": "CHASSIS-TRACK-001",
            "engine_number": "ENGINE-TRACK-001",
            "vehicle_type": "car",
            "brand": "Toyota",
            "model": "Corolla",
            "manufacturing_year": 2024,
            "color": "White",
            "default_speed_limit_kph": 80,
        },
    )
    assert blocked_vehicle.status_code == 403

    owner_link_approval = await client.post(
        f"/api/v1/owners/provider-links/{link_id}/respond",
        headers=owner_headers,
        json={"decision": "approve", "notes": "I approve this VTS provider"},
    )
    assert owner_link_approval.status_code == 200, owner_link_approval.text
    assert owner_link_approval.json()["status"] == "active"

    vehicle_registration = await client.post(
        "/api/v1/vehicles",
        headers=provider_headers,
        json={
            "owner_id": owner_id,
            "registration_number": "DHAKA-METRO-GA-12-3456",
            "chassis_number": "CHASSIS-TRACK-001",
            "engine_number": "ENGINE-TRACK-001",
            "vehicle_type": "car",
            "brand": "Toyota",
            "model": "Corolla",
            "manufacturing_year": 2024,
            "color": "White",
            "default_speed_limit_kph": 80,
        },
    )
    assert vehicle_registration.status_code == 201, vehicle_registration.text
    vehicle_id = vehicle_registration.json()["id"]

    vehicle_approval = await client.post(
        f"/api/v1/vehicles/{vehicle_id}/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "BRTA record verified"},
    )
    assert vehicle_approval.status_code == 200, vehicle_approval.text

    provider_connection = await client.post(
        f"/api/v1/tracking/vehicles/{vehicle_id}/connect-provider",
        headers=provider_headers,
        json={
            "provider_id": provider_id,
            "device_identifier": "VTS-DEVICE-001",
            "imei": "123456789012345",
            "account_reference": "CLIENT-001",
            "manufacturer": "Concox",
            "model": "GT06N",
        },
    )
    assert provider_connection.status_code == 201, provider_connection.text
    provider_assignment = provider_connection.json()
    assert provider_assignment["status"] == "pending_provider_confirmation"

    provider_confirmation = await client.post(
        f"/api/v1/tracking/assignments/{provider_assignment['id']}/provider-confirm",
        headers=provider_headers,
        json={"decision": "approve", "notes": "Device belongs to this provider"},
    )
    assert provider_confirmation.status_code == 200, provider_confirmation.text
    confirmed = provider_confirmation.json()
    assert confirmed["status"] == "active"

    provider_telemetry = await client.post(
        "/api/v1/telemetry",
        headers=provider_headers,
        json={
            "source_code": confirmed["source"]["code"],
            "device_identifier": "VTS-DEVICE-001",
            "external_event_id": "VTS-EVENT-001",
            "recorded_at": "2026-07-26T12:00:00+06:00",
            "latitude": 23.8103,
            "longitude": 90.4125,
            "speed_kph": 50,
        },
    )
    assert provider_telemetry.status_code == 202, provider_telemetry.text

    provider_unlink_attempt = await client.post(
        f"/api/v1/owners/provider-links/{link_id}/unlink",
        headers=provider_headers,
        json={"reason": "Provider cannot unlink the owner"},
    )
    assert provider_unlink_attempt.status_code == 403

    owner_unlink = await client.post(
        f"/api/v1/owners/provider-links/{link_id}/unlink",
        headers=owner_headers,
        json={"reason": "Owner changed tracking service"},
    )
    assert owner_unlink.status_code == 200, owner_unlink.text
    assert owner_unlink.json()["status"] == "ended"

    ended_assignment = await client.get(
        f"/api/v1/tracking/assignments/{provider_assignment['id']}",
        headers=owner_headers,
    )
    assert ended_assignment.status_code == 200
    assert ended_assignment.json()["status"] == "ended"

    provider_vehicle_after_unlink = await client.post(
        "/api/v1/vehicles",
        headers=provider_headers,
        json={
            "owner_id": owner_id,
            "registration_number": "DHAKA-METRO-GA-65-4321",
            "chassis_number": "CHASSIS-TRACK-002",
            "engine_number": "ENGINE-TRACK-002",
            "vehicle_type": "car",
            "default_speed_limit_kph": 80,
        },
    )
    assert provider_vehicle_after_unlink.status_code == 403

    owner_selected_provider = await client.post(
        "/api/v1/owners/provider-links",
        headers=owner_headers,
        json={"provider_id": provider_id},
    )
    assert owner_selected_provider.status_code == 201, owner_selected_provider.text
    owner_selected_link = owner_selected_provider.json()
    assert owner_selected_link["status"] == "pending_provider_approval"

    provider_accepts_owner_request = await client.post(
        f"/api/v1/owners/provider-links/{owner_selected_link['id']}/respond",
        headers=provider_headers,
        json={"decision": "approve", "notes": "Provider accepts this owner"},
    )
    assert provider_accepts_owner_request.status_code == 200
    assert provider_accepts_owner_request.json()["status"] == "active"

    owner_device = await client.post(
        f"/api/v1/tracking/vehicles/{vehicle_id}/register-owner-device",
        headers=owner_headers,
        json={
            "device_identifier": "OWNER-DEVICE-001",
            "imei": "987654321098765",
            "manufacturer": "Teltonika",
            "model": "FMB920",
            "protocol": "teltonika_codec_8",
            "firmware_version": "1.0.0",
            "sim_number": "+8801611111111",
            "data_frequency_seconds": 10,
        },
    )
    assert owner_device.status_code == 201, owner_device.text
    owner_assignment = owner_device.json()

    test_payload = await client.post(
        f"/api/v1/tracking/assignments/{owner_assignment['id']}/test-telemetry",
        headers=owner_headers,
        json={
            "recorded_at": "2026-07-26T12:05:00+06:00",
            "latitude": 23.8104,
            "longitude": 90.4126,
            "speed_kph": 0,
            "ignition": True,
        },
    )
    assert test_payload.status_code == 200, test_payload.text

    owner_device_approval = await client.post(
        f"/api/v1/tracking/assignments/{owner_assignment['id']}/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "Protocol test passed"},
    )
    assert owner_device_approval.status_code == 200, owner_device_approval.text
    activated = owner_device_approval.json()
    assert activated["status"] == "active"

    owner_telemetry = await client.post(
        "/api/v1/telemetry",
        headers=owner_headers,
        json={
            "source_code": activated["source"]["code"],
            "device_identifier": "OWNER-DEVICE-001",
            "external_event_id": "OWNER-EVENT-001",
            "recorded_at": "2026-07-26T12:10:00+06:00",
            "latitude": 23.8105,
            "longitude": 90.4127,
            "speed_kph": 45,
        },
    )
    assert owner_telemetry.status_code == 202, owner_telemetry.text
    assert owner_telemetry.json()["assignment_id"] == owner_assignment["id"]
