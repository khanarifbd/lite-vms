import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.owners.service import get_owner_username
from app.modules.vehicles.gomax_import_client import fetch_gomax_projects
from app.modules.vehicles.gomax_import_schema import (
    GoMaxImportPreview,
    GoMaxImportRequest,
    GoMaxProjectPreview,
)
from app.modules.vehicles.gomax_import_service import existing_project_ids, import_projects
from app.modules.vehicles.provider_registration_router import require_approved_provider
from app.modules.vehicles.router import resolve_vehicle_owner

router = APIRouter(
    prefix="/vehicles/provider-registration/gomax-import",
    tags=["VTS Provider Vehicle Registration"],
)

MANAGE_ROLES = (UserRole.VTS_ADMIN, UserRole.VTS_OPERATOR)


async def resolve_projects(
    session: AsyncSession,
    *,
    actor: User,
    owner_id: uuid.UUID,
):
    owner, provider = await resolve_vehicle_owner(session, actor=actor, owner_id=owner_id)
    if provider is None:
        provider = await require_approved_provider(session, actor)
    username = await get_owner_username(session, owner)
    if not username:
        raise HTTPException(status_code=422, detail="The selected owner does not have a username")
    gomax_owner_id, projects = await fetch_gomax_projects(username)
    return owner, provider, gomax_owner_id, projects


@router.get("/preview", response_model=GoMaxImportPreview)
async def preview_gomax_import(
    owner_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> GoMaxImportPreview:
    _, _, gomax_owner_id, projects = await resolve_projects(
        session,
        actor=actor,
        owner_id=owner_id,
    )
    existing_ids = await existing_project_ids(session, projects)
    preview_projects = [
        GoMaxProjectPreview(
            project_id=project["project_id"],
            project_name=project["project_name"],
            already_imported=project["project_id"] in existing_ids,
        )
        for project in projects
    ]
    return GoMaxImportPreview(
        gomax_owner_id=gomax_owner_id,
        total=len(preview_projects),
        available=sum(not project.already_imported for project in preview_projects),
        already_imported=sum(project.already_imported for project in preview_projects),
        projects=preview_projects,
    )


@router.post("/execute")
async def execute_gomax_import(
    payload: GoMaxImportRequest,
    actor: Annotated[User, Depends(require_roles(*MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int | str]:
    owner, provider, gomax_owner_id, projects = await resolve_projects(
        session,
        actor=actor,
        owner_id=payload.owner_id,
    )
    projects_by_id = {project["project_id"]: project for project in projects}
    requested_ids = payload.project_ids if payload.project_ids is not None else list(projects_by_id)
    unknown = [project_id for project_id in requested_ids if project_id not in projects_by_id]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail="One or more selected Go Max vehicles are no longer available",
        )

    selected = [projects_by_id[project_id] for project_id in requested_ids]
    imported_ids = await import_projects(
        session,
        owner=owner,
        provider=provider,
        projects=selected,
    )
    if imported_ids:
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=provider.root_organization_id,
            action="vehicle.gomax_imported",
            resource_type="vehicle_import",
            new_values={
                "owner_id": str(owner.id),
                "gomax_owner_id": gomax_owner_id,
                "project_ids": imported_ids,
                "imported": len(imported_ids),
            },
        )
    await session.commit()
    return {
        "message": "Go Max vehicles imported",
        "gomax_owner_id": gomax_owner_id,
        "requested": len(requested_ids),
        "imported": len(imported_ids),
        "skipped": len(requested_ids) - len(imported_ids),
    }
