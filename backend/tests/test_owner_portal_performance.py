import pytest
from httpx import AsyncClient

from test_provider_customer_management import provider_customer_api


@pytest.mark.asyncio
async def test_owner_provider_workspace_defers_vehicle_data_and_keeps_scoping(
    provider_customer_api: tuple[AsyncClient, dict[str, str], dict[str, str], str],
) -> None:
    client, provider_headers, owner_headers, owner_id = provider_customer_api

    workspace = await client.get(
        "/api/v1/owners/me/provider-connections", headers=owner_headers
    )
    assert workspace.status_code == 200, workspace.text
    data = workspace.json()
    assert data["vehicles"] == []
    assert data["stats"]["active"] == 1
    assert any(link["status"] == "active" for link in data["connections"])

    options = await client.get(
        "/api/v1/owners/me/provider-connections/vehicles", headers=owner_headers
    )
    assert options.status_code == 200, options.text
    assert options.json() == []

    denied = await client.get(
        "/api/v1/owners/me/provider-connections/vehicles",
        headers=provider_headers,
    )
    assert denied.status_code == 403, denied.text
