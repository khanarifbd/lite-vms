from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import VehicleVerificationStatus
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.vehicles.model import Vehicle


async def existing_project_ids(
    session: AsyncSession,
    projects: list[dict[str, str]],
) -> set[str]:
    if not projects:
        return set()
    identities = [f"GOMAX-{project['project_id']}" for project in projects]
    existing = set(
        await session.scalars(
            select(Vehicle.chassis_number).where(Vehicle.chassis_number.in_(identities))
        )
    )
    return {
        identity.removeprefix("GOMAX-")
        for identity in existing
        if identity and identity.startswith("GOMAX-")
    }


async def import_projects(
    session: AsyncSession,
    *,
    owner: VehicleOwner,
    provider: VTSProvider,
    projects: list[dict[str, str]],
) -> list[str]:
    existing_ids = await existing_project_ids(session, projects)
    imported_ids: list[str] = []
    for project in projects:
        project_id = project["project_id"]
        if project_id in existing_ids:
            continue
        source_identity = f"GOMAX-{project_id}"
        session.add(
            Vehicle(
                registration_number=source_identity,
                registration_number_display=project["project_name"][:80],
                registered_owner_name=owner.name,
                chassis_number=source_identity,
                vehicle_type="Imported",
                owner_id=owner.id,
                created_by_provider_id=provider.id,
                verification_status=VehicleVerificationStatus.DRAFT,
                notes=(
                    f"Imported from Go Max project {project_id}. "
                    "Complete vehicle details and documents later."
                ),
            )
        )
        imported_ids.append(project_id)
    return imported_ids
