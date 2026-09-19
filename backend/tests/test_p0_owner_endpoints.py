import pytest
from httpx import AsyncClient

from test_provider_customer_management import provider_customer_api


@pytest.mark.asyncio
async def test_provider_owner_dropdown_and_portfolio_are_role_scoped(
    provider_customer_api: tuple[AsyncClient, dict[str, str], dict[str, str], str],
) -> None:
    client, provider_headers, owner_headers, owner_id = provider_customer_api

    options = await client.get("/api/v1/providers/me/owners/options", headers=provider_headers)
    assert options.status_code == 200, options.text
    assert len(options.json()) == 1
    assert options.json()[0]["id"] == owner_id
    assert set(options.json()[0]) == {
        "id", "owner_name", "owner_code", "identity_reference", "phone"
    }

    portfolio = await client.get("/api/v1/providers/me/owners/portfolio", headers=provider_headers)
    assert portfolio.status_code == 200, portfolio.text
    assert portfolio.json()["total"] == 1
    assert portfolio.json()["items"][0]["owner"]["id"] == owner_id
    assert portfolio.json()["items"][0]["owner"]["total_vehicles"] == 0

    for suffix in ("options", "portfolio"):
        denied = await client.get(
            f"/api/v1/providers/me/owners/{suffix}", headers=owner_headers
        )
        assert denied.status_code == 403, denied.text
