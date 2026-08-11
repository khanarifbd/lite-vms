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
async def driver_api(
    tmp_path: Path,
) -> AsyncIterator[tuple[AsyncClient, dict[str, str]]]:
    database_path = tmp_path / "driver-registry.db"
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


async def login(client: AsyncClient, username: str, password: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": password},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def provider_payload() -> dict[str, object]:
    return {
        "legal_name": "Driver Test VTS Limited",
        "trade_name": "Driver Test VTS",
        "btrc_license_number": "BTRC-DRIVER-001",
        "trade_license_number": "TRADE-DRIVER-001",
        "company_registration_number": "RJSC-DRIVER-001",
        "tin_number": "TIN-DRIVER-001",
        "bin_number": "BIN-DRIVER-001",
        "registered_address": "Dhaka, Bangladesh",
        "district": "Dhaka",
        "website_url": "https://driver-vts.example",
        "technical_contact_name": "Driver VTS Technical Team",
        "technical_contact_email": "tech@driver-vts.example",
        "technical_contact_mobile": "+8801811111111",
        "api_base_url": "https://api.driver-vts.example",
        "estimated_vehicle_count": 500,
        "current_platform_name": "Driver VTS Cloud",
        "data_submission_interval_seconds": 10,
        "allowed_server_ips": ["203.0.113.30"],
        "documents": [
            {
                "document_type": "btrc_license",
                "document_number": "BTRC-DRIVER-001",
                "file_name": "btrc.pdf",
                "file_url": "https://files.example/btrc-driver.pdf",
                "expires_at": None,
            },
            {
                "document_type": "trade_license",
                "document_number": "TRADE-DRIVER-001",
                "file_name": "trade.pdf",
                "file_url": "https://files.example/trade-driver.pdf",
                "expires_at": None,
            },
        ],
        "declaration_accepted": True,
    }


def owner_payload() -> dict[str, object]:
    return {
        "admin_email": "fleet.owner@example.com",
        "admin_mobile": "+8801911111111",
        "admin_full_name": "Fleet Owner",
        "password": "Fleet-Owner-Password-123",
        "owner_type": "individual",
        "owner_name": "Fleet Owner",
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
                "document_reference": "NID-OWNER-7654",
                "file_name": "owner-nid.pdf",
                "file_url": "https://files.example/owner-nid.pdf",
                "expires_at": None,
            }
        ],
        "declaration_accepted": True,
    }


def driver_payload() -> dict[str, object]:
    return {
        "full_name": "Md Professional Driver",
        "nid_reference": "19901234567890123",
        "date_of_birth": "1990-01-15",
        "father_name": "Driver Father",
        "mother_name": "Driver Mother",
        "gender": "male",
        "blood_group": "B+",
        "email": "driver@example.com",
        "mobile": "+8801712345678",
        "emergency_contact_name": "Driver Emergency",
        "emergency_contact_phone": "+8801812345678",
        "present_address": "Dhaka, Bangladesh",
        "permanent_address": "Cumilla, Bangladesh",
        "district": "Dhaka",
        "photo_url": "https://files.example/driver-photo.jpg",
        "licence_number": "DL-BRTA-2026-001",
        "licence_type": "professional",
        "vehicle_classes": ["LIGHT", "MEDIUM"],
        "first_issue_date": "2015-01-01",
        "issue_date": "2025-01-01",
        "licence_expiry_date": "2030-01-01",
        "documents": [
            {
                "document_type": "national_id_front",
                "document_reference": "NID-DRIVER-0123",
                "file_name": "nid-front.pdf",
                "file_url": "https://files.example/driver-nid-front.pdf",
                "expires_at": None,
            },
            {
                "document_type": "driving_licence_front",
                "document_reference": "DL-BRTA-2026-001",
                "file_name": "licence-front.pdf",
                "file_url": "https://files.example/licence-front.pdf",
                "expires_at": "2030-01-01T00:00:00Z",
            },
            {
                "document_type": "driver_photo",
                "document_reference": None,
                "file_name": "driver-photo.jpg",
                "file_url": "https://files.example/driver-photo.jpg",
                "expires_at": None,
            },
        ],
        "declaration_accepted": True,
        "login_username": "professional.driver.001",
        "temporary_password": None,
    }


@pytest.mark.asyncio
async def test_provider_and_owner_share_one_global_driver_and_assign_vehicle(
    driver_api: tuple[AsyncClient, dict[str, str]],
) -> None:
    client, admin_headers = driver_api

    applicant = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin@driver-vts.example",
            "mobile": "+8801611111111",
            "full_name": "Driver VTS Admin",
            "password": "Driver-VTS-Password-123",
        },
    )
    assert applicant.status_code == 201, applicant.text
    applicant_headers = await login(
        client,
        "admin@driver-vts.example",
        "Driver-VTS-Password-123",
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
        "admin@driver-vts.example",
        "Driver-VTS-Password-123",
    )

    owner_registration = await client.post("/api/v1/owners/register", json=owner_payload())
    assert owner_registration.status_code == 201, owner_registration.text
    owner_id = owner_registration.json()["owner"]["id"]
    owner_code = owner_registration.json()["owner"]["owner_code"]
    owner_approval = await client.post(
        f"/api/v1/owners/{owner_id}/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "Owner verified"},
    )
    assert owner_approval.status_code == 200, owner_approval.text
    owner_headers = await login(client, "fleet.owner@example.com", "Fleet-Owner-Password-123")

    provider_owner_request = await client.post(
        "/api/v1/owners/provider-links",
        headers=owner_headers,
        json={"provider_id": provider_id},
    )
    assert provider_owner_request.status_code == 201, provider_owner_request.text
    provider_owner_link_id = provider_owner_request.json()["id"]
    provider_owner_approval = await client.post(
        f"/api/v1/owners/provider-links/{provider_owner_link_id}/respond",
        headers=provider_headers,
        json={"decision": "approve", "notes": "Provider accepted the owner"},
    )
    assert provider_owner_approval.status_code == 200, provider_owner_approval.text
    assert provider_owner_approval.json()["status"] == "active"

    missing = await client.post(
        "/api/v1/drivers/owner-links/lookup",
        headers=provider_headers,
        json={
            "owner_id": owner_id,
            "nid_reference": "19901234567890123",
        },
    )
    assert missing.status_code == 200, missing.text
    assert missing.json()["exists"] is False
    assert missing.json()["next_action"] == "complete_driver_registration"

    provider_created = await client.post(
        "/api/v1/drivers/provider-register",
        headers=provider_headers,
        json=driver_payload(),
    )
    assert provider_created.status_code == 200, provider_created.text
    created = provider_created.json()
    driver_id = created["driver"]["id"]
    assert created["already_registered"] is False
    assert created["must_change_password"] is True
    provider_link_id = next(
        item["link_id"]
        for item in created["driver"]["links"]
        if item["organization_type"] == "vts_provider"
    )

    duplicate_self = await client.post(
        "/api/v1/drivers/register",
        json={**driver_payload(), "password": "Driver-New-Password-123"},
    )
    assert duplicate_self.status_code == 409
    assert duplicate_self.json()["detail"]["next_action"] == "request_mobile_password_reset"

    otp_request = await client.post(
        "/api/v1/drivers/password-reset/mobile/request",
        json={
            "nid_reference": "19901234567890123",
            "mobile": "+8801712345678",
        },
    )
    assert otp_request.status_code == 202, otp_request.text
    challenge = otp_request.json()
    assert challenge["development_otp"]
    otp_confirm = await client.post(
        "/api/v1/drivers/password-reset/mobile/confirm",
        json={
            "challenge_id": challenge["challenge_id"],
            "otp": challenge["development_otp"],
            "new_password": "Driver-New-Password-123",
        },
    )
    assert otp_confirm.status_code == 200, otp_confirm.text
    driver_headers = await login(
        client,
        "professional.driver.001",
        "Driver-New-Password-123",
    )

    provider_link_approval = await client.post(
        f"/api/v1/drivers/links/{provider_link_id}/respond",
        headers=driver_headers,
        json={"decision": "approve", "notes": "Provider approved"},
    )
    assert provider_link_approval.status_code == 200, provider_link_approval.text
    assert provider_link_approval.json()["status"] == "active"

    provider_lookup = await client.post(
        "/api/v1/drivers/owner-links/lookup",
        headers=provider_headers,
        json={
            "owner_id": owner_id,
            "nid_reference": "19901234567890123",
        },
    )
    assert provider_lookup.status_code == 200, provider_lookup.text
    lookup_body = provider_lookup.json()
    assert lookup_body["exists"] is True
    assert lookup_body["driver_id"] == driver_id
    assert lookup_body["provider_link_status"] == "active"
    assert lookup_body["owner_link_status"] is None
    assert lookup_body["can_send_request"] is True

    owner_link_request = await client.post(
        "/api/v1/drivers/owner-links/request",
        headers=provider_headers,
        json={"owner_id": owner_id, "driver_id": driver_id},
    )
    assert owner_link_request.status_code == 200, owner_link_request.text
    owner_link_result = owner_link_request.json()
    owner_link_id = owner_link_result["owner_link"]["id"]
    assert owner_link_result["owner_link"]["status"] == "pending_driver_approval"
    assert owner_link_result["owner_link"]["requested_by"] == "vts_provider"
    assert owner_link_result["provider_link"]["status"] == "active"

    owner_pending_lookup = await client.post(
        "/api/v1/drivers/owner-links/lookup",
        headers=owner_headers,
        json={"nid_reference": "19901234567890123"},
    )
    assert owner_pending_lookup.status_code == 200, owner_pending_lookup.text
    assert owner_pending_lookup.json()["owner_link_status"] == "pending_driver_approval"
    assert owner_pending_lookup.json()["next_action"] == "await_driver_approval"

    driver_approval = await client.post(
        f"/api/v1/drivers/{driver_id}/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "NID and BRTA licence verified"},
    )
    assert driver_approval.status_code == 200, driver_approval.text
    assert driver_approval.json()["verification_status"] == "verified"
    assert driver_approval.json()["licence"]["verification_status"] == "verified"

    profile_change_payload = {
        key: value
        for key, value in driver_payload().items()
        if key
        not in {
            "email",
            "mobile",
            "licence_number",
            "licence_type",
            "login_username",
            "temporary_password",
        }
    }
    profile_change_payload["present_address"] = (
        "Proposed address that must not replace the verified record before Police approval"
    )
    locked_application = await client.post(
        "/api/v1/drivers/me/application",
        headers=driver_headers,
        json=profile_change_payload,
    )
    assert locked_application.status_code == 409, locked_application.text

    profile_change = await client.post(
        "/api/v1/drivers/me/profile-change",
        headers=driver_headers,
        json=profile_change_payload,
    )
    assert profile_change.status_code == 200, profile_change.text
    assert profile_change.json()["verification_status"] == "verified"
    assert profile_change.json()["profile_change_status"] == "pending"
    assert (
        profile_change.json()["present_address"]
        != profile_change_payload["present_address"]
    )

    profile_change_queue = await client.get(
        "/api/v1/admin/approvals/queue"
        "?entity=driver&status=pending&search=19901234567890123&limit=20",
        headers=admin_headers,
    )
    assert profile_change_queue.status_code == 200, profile_change_queue.text
    queued_change = profile_change_queue.json()["items"][0]
    assert queued_change["id"] == driver_id
    assert queued_change["verification_status"] == "verified"
    assert queued_change["profile_change_status"] == "pending"
    assert queued_change["pending_profile_changes"]["present_address"] == (
        profile_change_payload["present_address"]
    )

    vehicle = await client.post(
        "/api/v1/vehicles",
        headers=owner_headers,
        json={
            "registration_number": "DHAKA-METRO-GA-77-1234",
            "chassis_number": "DRIVER-CHASSIS-001",
            "engine_number": "DRIVER-ENGINE-001",
            "vehicle_type": "car",
            "brand": "Toyota",
            "model": "Corolla",
            "manufacturing_year": 2024,
            "color": "White",
            "default_speed_limit_kph": 80,
        },
    )
    assert vehicle.status_code == 201, vehicle.text
    vehicle_id = vehicle.json()["id"]
    vehicle_approval = await client.post(
        f"/api/v1/vehicles/{vehicle_id}/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "Vehicle verified"},
    )
    assert vehicle_approval.status_code == 200, vehicle_approval.text

    blocked_assignment = await client.post(
        "/api/v1/assignments",
        headers=provider_headers,
        json={
            "vehicle_id": vehicle_id,
            "driver_id": driver_id,
            "notes": "Must wait for owner-driver consent",
        },
    )
    assert blocked_assignment.status_code == 403, blocked_assignment.text
    assert "active link with the vehicle owner" in blocked_assignment.json()["detail"]

    owner_link_approval = await client.post(
        f"/api/v1/drivers/links/{owner_link_id}/respond",
        headers=driver_headers,
        json={"decision": "approve", "notes": "Owner approved"},
    )
    assert owner_link_approval.status_code == 200, owner_link_approval.text
    assert owner_link_approval.json()["status"] == "active"

    active_lookup = await client.post(
        "/api/v1/drivers/owner-links/lookup",
        headers=owner_headers,
        json={"nid_reference": "19901234567890123"},
    )
    assert active_lookup.status_code == 200, active_lookup.text
    assert active_lookup.json()["owner_link_status"] == "active"
    assert active_lookup.json()["next_action"] == "already_connected"

    assignment = await client.post(
        "/api/v1/assignments",
        headers=provider_headers,
        json={
            "vehicle_id": vehicle_id,
            "driver_id": driver_id,
            "notes": "Primary driver assigned by VTS provider",
        },
    )
    assert assignment.status_code == 201, assignment.text
    assert assignment.json()["status"] == "active"
    assert assignment.json()["is_on_duty"] is True
    assert assignment.json()["provider_id"] == provider_id

    profile_change_review = await client.post(
        f"/api/v1/drivers/{driver_id}/profile-change/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "Reviewed later profile correction"},
    )
    assert profile_change_review.status_code == 200, profile_change_review.text
    assert profile_change_review.json()["verification_status"] == "verified"
    assert profile_change_review.json()["profile_change_status"] == "approved"
    assert (
        profile_change_review.json()["present_address"]
        == profile_change_payload["present_address"]
    )

    initial_duty_history = await client.get(
        "/api/v1/assignments/duty-history?limit=20",
        headers=driver_headers,
    )
    assert initial_duty_history.status_code == 200, initial_duty_history.text
    assert initial_duty_history.json()["total"] == 1
    assert initial_duty_history.json()["items"][0]["driver_id"] == driver_id
    assert initial_duty_history.json()["items"][0]["vehicle_id"] == vehicle_id
    assert initial_duty_history.json()["items"][0]["is_open"] is True

    relief_payload = driver_payload()
    relief_payload.update(
        {
            "full_name": "Md Relief Driver",
            "nid_reference": "19881234567890124",
            "email": "relief.driver@example.com",
            "mobile": "+8801712345689",
            "emergency_contact_phone": "+8801812345689",
            "licence_number": "DL-BRTA-2026-002",
            "login_username": "professional.driver.002",
            "temporary_password": "Relief-Driver-Password-123",
        }
    )
    relief_payload["documents"] = [
        {
            **document,
            "document_reference": (
                "NID-DRIVER-0124"
                if document["document_type"] == "national_id_front"
                else "DL-BRTA-2026-002"
                if document["document_type"] == "driving_licence_front"
                else None
            ),
        }
        for document in relief_payload["documents"]
    ]
    relief_created = await client.post(
        "/api/v1/drivers/provider-register",
        headers=provider_headers,
        json=relief_payload,
    )
    assert relief_created.status_code == 200, relief_created.text
    relief_driver_id = relief_created.json()["driver"]["id"]
    relief_provider_link_id = next(
        item["link_id"]
        for item in relief_created.json()["driver"]["links"]
        if item["organization_type"] == "vts_provider"
    )
    relief_headers = await login(
        client,
        "professional.driver.002",
        "Relief-Driver-Password-123",
    )
    relief_provider_approval = await client.post(
        f"/api/v1/drivers/links/{relief_provider_link_id}/respond",
        headers=relief_headers,
        json={"decision": "approve", "notes": "Provider approved for relief duty"},
    )
    assert relief_provider_approval.status_code == 200, relief_provider_approval.text

    relief_review = await client.post(
        f"/api/v1/drivers/{relief_driver_id}/review",
        headers=admin_headers,
        json={"decision": "approve", "notes": "Relief driver identity verified"},
    )
    assert relief_review.status_code == 200, relief_review.text

    relief_owner_request = await client.post(
        "/api/v1/drivers/owner-links/request",
        headers=provider_headers,
        json={"owner_id": owner_id, "driver_id": relief_driver_id},
    )
    assert relief_owner_request.status_code == 200, relief_owner_request.text
    relief_owner_link_id = relief_owner_request.json()["owner_link"]["id"]
    relief_owner_approval = await client.post(
        f"/api/v1/drivers/links/{relief_owner_link_id}/respond",
        headers=relief_headers,
        json={"decision": "approve", "notes": "Owner approved for the long-haul roster"},
    )
    assert relief_owner_approval.status_code == 200, relief_owner_approval.text

    standby_assignment = await client.post(
        "/api/v1/assignments",
        headers=owner_headers,
        json={
            "vehicle_id": vehicle_id,
            "driver_id": relief_driver_id,
            "start_on_duty": False,
            "notes": "Second driver added for long-haul roster coverage",
        },
    )
    assert standby_assignment.status_code == 201, standby_assignment.text
    standby_assignment_id = standby_assignment.json()["id"]
    assert standby_assignment.json()["status"] == "active"
    assert standby_assignment.json()["is_on_duty"] is False

    handover = await client.post(
        f"/api/v1/assignments/{standby_assignment_id}/start-duty",
        headers=owner_headers,
        json={"reason": "Primary driver is resting during the long-haul shift"},
    )
    assert handover.status_code == 200, handover.text
    assert handover.json()["status"] == "active"
    assert handover.json()["is_on_duty"] is True

    roster = await client.get(
        f"/api/v1/assignments/vehicle/{vehicle_id}",
        headers=owner_headers,
    )
    assert roster.status_code == 200, roster.text
    active_roster = [item for item in roster.json() if item["status"] == "active"]
    assert len(active_roster) == 2
    assert sum(item["is_on_duty"] for item in active_roster) == 1
    original_assignment = next(
        item for item in active_roster if item["id"] == assignment.json()["id"]
    )
    assert original_assignment["is_on_duty"] is False

    handover_back = await client.post(
        f"/api/v1/assignments/{assignment.json()['id']}/start-duty",
        headers=owner_headers,
        json={"reason": "Relief period finished; primary driver resumes duty"},
    )
    assert handover_back.status_code == 200, handover_back.text
    assert handover_back.json()["is_on_duty"] is True

    ended_relief = await client.post(
        f"/api/v1/assignments/{standby_assignment_id}/end",
        headers=owner_headers,
        json={"notes": "Relief driver completed this journey roster"},
    )
    assert ended_relief.status_code == 200, ended_relief.text
    assert ended_relief.json()["status"] == "ended"
    assert ended_relief.json()["is_on_duty"] is False

    duty_history = await client.get(
        f"/api/v1/assignments/duty-history?vehicle_id={vehicle_id}&limit=20",
        headers=admin_headers,
    )
    assert duty_history.status_code == 200, duty_history.text
    duty_items = duty_history.json()["items"]
    assert duty_history.json()["total"] == 3
    assert sum(item["is_open"] for item in duty_items) == 1
    assert len([item for item in duty_items if item["driver_id"] == driver_id]) == 2
    relief_duty = [item for item in duty_items if item["driver_id"] == relief_driver_id]
    assert len(relief_duty) == 1
    assert relief_duty[0]["ended_at"] is not None
    assert relief_duty[0]["duration_seconds"] >= 0

    filtered_duty_history = await client.get(
        f"/api/v1/assignments/duty-history?driver_id={relief_driver_id}",
        headers=admin_headers,
    )
    assert filtered_duty_history.status_code == 200, filtered_duty_history.text
    assert filtered_duty_history.json()["total"] == 1

    history = await client.get(
        f"/api/v1/assignments/vehicle/{vehicle_id}",
        headers=owner_headers,
    )
    assert history.status_code == 200
    original_history = next(
        item for item in history.json() if item["id"] == assignment.json()["id"]
    )
    assert original_history["driver_id"] == driver_id

    unlink = await client.post(
        f"/api/v1/drivers/owner-links/{owner_link_id}/unlink",
        headers=owner_headers,
        json={"reason": "Driver is moving to a new owner-managed duty cycle"},
    )
    assert unlink.status_code == 200, unlink.text
    assert unlink.json()["link"]["status"] == "ended"
    assert unlink.json()["ended_assignment_count"] == 1

    ended_history = await client.get(
        f"/api/v1/assignments/vehicle/{vehicle_id}",
        headers=owner_headers,
    )
    assert ended_history.status_code == 200, ended_history.text
    assert ended_history.json()[0]["status"] == "ended"
    assert ended_history.json()[0]["is_on_duty"] is False

    driver_owner_request = await client.post(
        "/api/v1/drivers/owner-links/driver-request",
        headers=driver_headers,
        json={
            "owner_code": owner_code,
            "notes": "Requesting a renewed owner connection",
        },
    )
    assert driver_owner_request.status_code == 200, driver_owner_request.text
    renewed_link_id = driver_owner_request.json()["id"]
    assert driver_owner_request.json()["status"] == "pending_organization_approval"
    assert driver_owner_request.json()["requested_by"] == "driver"

    owner_acceptance = await client.post(
        f"/api/v1/drivers/owner-links/{renewed_link_id}/respond",
        headers=owner_headers,
        json={"decision": "approve", "notes": "Owner accepted the driver request"},
    )
    assert owner_acceptance.status_code == 200, owner_acceptance.text
    assert owner_acceptance.json()["status"] == "active"

    locked = await client.post(
        f"/api/v1/admin/drivers/{driver_id}/account-status",
        headers=admin_headers,
        json={"action": "lock", "reason": "Temporary identity security hold"},
    )
    assert locked.status_code == 200, locked.text
    blocked_locked_assignment = await client.post(
        "/api/v1/assignments",
        headers=owner_headers,
        json={
            "vehicle_id": vehicle_id,
            "driver_id": driver_id,
            "notes": "Locked login account must not be assigned",
        },
    )
    assert blocked_locked_assignment.status_code == 409
    assert "login account must be active" in blocked_locked_assignment.json()["detail"]
    activated = await client.post(
        f"/api/v1/admin/drivers/{driver_id}/account-status",
        headers=admin_headers,
        json={"action": "activate", "reason": "Identity security hold cleared"},
    )
    assert activated.status_code == 200, activated.text

    renewed_assignment = await client.post(
        "/api/v1/assignments",
        headers=owner_headers,
        json={
            "vehicle_id": vehicle_id,
            "driver_id": driver_id,
            "notes": "Renewed owner-managed assignment",
        },
    )
    assert renewed_assignment.status_code == 201, renewed_assignment.text
    assert renewed_assignment.json()["status"] == "active"
    assert renewed_assignment.json()["is_on_duty"] is True

    suspended = await client.post(
        f"/api/v1/admin/drivers/{driver_id}/account-status",
        headers=admin_headers,
        json={"action": "suspend", "reason": "Administrative safety review"},
    )
    assert suspended.status_code == 200, suspended.text
    assert suspended.json()["detail"]["account_status"] == "suspended"
    assert suspended.json()["detail"]["history"][0]["new_values"]["ended_assignment_count"] == 1

    suspension_history = await client.get(
        f"/api/v1/assignments/vehicle/{vehicle_id}",
        headers=owner_headers,
    )
    assert suspension_history.status_code == 200, suspension_history.text
    assert suspension_history.json()[0]["status"] == "ended"

    final_duty_history = await client.get(
        "/api/v1/assignments/duty-history"
        "?search=DHAKA-METRO-GA-77-1234&offset=0&limit=50",
        headers=admin_headers,
    )
    assert final_duty_history.status_code == 200, final_duty_history.text
    assert final_duty_history.json()["total"] == 4
    assert all(not item["is_open"] for item in final_duty_history.json()["items"])
    assert all(item["ended_at"] is not None for item in final_duty_history.json()["items"])

    blocked_suspended_assignment = await client.post(
        "/api/v1/assignments",
        headers=owner_headers,
        json={
            "vehicle_id": vehicle_id,
            "driver_id": driver_id,
            "notes": "Suspended driver must not be assigned",
        },
    )
    assert blocked_suspended_assignment.status_code == 409
    assert "must be active" in blocked_suspended_assignment.json()["detail"]
