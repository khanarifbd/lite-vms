from urllib.parse import quote

import httpx
from fastapi import HTTPException

from app.core.config import settings


async def fetch_gomax_projects(username: str) -> tuple[str, list[dict[str, str]]]:
    base_url = settings.gomax_crm_base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            login = await client.post(
                f"{base_url}/login_with_username/{quote(username, safe='')}"
            )
            login.raise_for_status()
            customer = login.json()
            gomax_owner_id = str(customer.get("id") or "").strip()
            if not gomax_owner_id:
                raise ValueError("Go Max did not return an owner ID")

            response = await client.get(
                f"{base_url}/device_list/{quote(gomax_owner_id, safe='')}"
            )
            response.raise_for_status()
            raw_projects = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Go Max import failed: {exc}") from None

    if not isinstance(raw_projects, list):
        raise HTTPException(status_code=502, detail="Go Max device list has an invalid format")

    projects: dict[str, dict[str, str]] = {}
    for raw in raw_projects:
        if not isinstance(raw, dict):
            continue
        project_id = str(raw.get("project_id") or "").strip()
        project_name = str(raw.get("project_name") or "").strip()
        if project_id and project_name:
            projects[project_id] = {
                "project_id": project_id,
                "project_name": project_name,
            }

    return gomax_owner_id, list(projects.values())
