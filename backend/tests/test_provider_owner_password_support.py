import uuid

import pytest
from httpx import AsyncClient

from test_provider_customer_management import provider_customer_api

from app.core.database import get_session
from app.main import app
from app.modules.owners.model import VehicleOwner


@pytest.mark.asyncio
async def test_provider_owner_password_support_checks_scope_and_revokes_sessions(
    provider_customer_api: tuple[AsyncClient, dict[str, str], dict[str, str], str],
) -> None:
    client, provider_headers, owner_headers, owner_id = provider_customer_api
    path = f"/api/v1/providers/me/owners/{owner_id}/reset-password"
    payload = {
        "new_password": "NewOwner-Temporary-Password-123",
        "reason": "Verified registered owner mobile before account recovery",
    }

    owner_denied = await client.post(path, headers=owner_headers, json=payload)
    assert owner_denied.status_code == 403

    unrelated = await client.post(
        f"/api/v1/providers/me/owners/{uuid.uuid4()}/reset-password",
        headers=provider_headers,
        json=payload,
    )
    assert unrelated.status_code == 404

    before = await client.get(
        f"/api/v1/providers/me/owners/{owner_id}", headers=provider_headers
    )
    assert before.status_code == 200, before.text
    assert before.json()["can_reset_password"] is True

    reset = await client.post(path, headers=provider_headers, json=payload)
    assert reset.status_code == 200, reset.text
    assert "new_password" not in reset.json()
    assert (await client.get("/api/v1/auth/me", headers=owner_headers)).status_code == 401

    old_login = await client.post(
        "/api/v1/auth/login",
        data={"username": "linked.owner", "password": "Owner-Password-123"},
    )
    assert old_login.status_code == 401, old_login.text
    new_login = await client.post(
        "/api/v1/auth/login",
        data={"username": "linked.owner", "password": payload["new_password"]},
    )
    assert new_login.status_code == 200, new_login.text
    assert new_login.json()["must_change_password"] is False

    # The provider-assigned password remains valid after signing in; the
    # first successful login must not force the owner into a change flow.
    repeat_login = await client.post(
        "/api/v1/auth/login",
        data={"username": "linked.owner", "password": payload["new_password"]},
    )
    assert repeat_login.status_code == 200, repeat_login.text
    assert repeat_login.json()["must_change_password"] is False


@pytest.mark.asyncio
async def test_linked_owner_registered_elsewhere_cannot_have_password_reset(
    provider_customer_api: tuple[AsyncClient, dict[str, str], dict[str, str], str],
) -> None:
    client, provider_headers, _, owner_id = provider_customer_api
    session_provider = app.dependency_overrides[get_session]
    async for session in session_provider():
        owner = await session.get(VehicleOwner, uuid.UUID(owner_id))
        assert owner is not None
        owner.created_by_provider_id = None
        await session.commit()

    details = await client.get(
        f"/api/v1/providers/me/owners/{owner_id}", headers=provider_headers
    )
    assert details.status_code == 200
    assert details.json()["can_reset_password"] is False

    reset = await client.post(
        f"/api/v1/providers/me/owners/{owner_id}/reset-password",
        headers=provider_headers,
        json={
            "new_password": "Another-Strong-Temporary-Password",
            "reason": "Verified registered owner mobile before account recovery",
        },
    )
    assert reset.status_code == 403, reset.text
