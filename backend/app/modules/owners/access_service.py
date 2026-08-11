import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.owners.enums import OwnerProviderLinkStatus
from app.modules.owners.model import VTSProviderOwnerLink


async def get_active_provider_owner_link(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    owner_id: uuid.UUID,
) -> VTSProviderOwnerLink | None:
    return await session.scalar(
        select(VTSProviderOwnerLink).where(
            VTSProviderOwnerLink.provider_id == provider_id,
            VTSProviderOwnerLink.owner_id == owner_id,
            VTSProviderOwnerLink.status == OwnerProviderLinkStatus.ACTIVE,
        )
    )


async def has_active_provider_vehicle_access(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    owner_id: uuid.UUID,
    vehicle_id: uuid.UUID,
) -> bool:
    """Allow a connected provider to access every vehicle owned by the linked owner.

    The vehicle_id parameter is retained for the existing call sites, but access no
    longer depends on who created the vehicle or on a separate per-vehicle grant.
    """
    _ = vehicle_id
    return (
        await get_active_provider_owner_link(
            session,
            provider_id=provider_id,
            owner_id=owner_id,
        )
        is not None
    )
