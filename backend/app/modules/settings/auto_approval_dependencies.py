from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    OrganizationStatus,
    OwnerDocumentStatus,
    OwnerVerificationStatus,
    TenantStatus,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.model import User
from app.modules.drivers.enums import DriverVerificationStatus
from app.modules.drivers.service import get_driver_for_user
from app.modules.iam.model import Organization, Tenant
from app.modules.owners.model import VehicleOwner, VehicleOwnerDocument
from app.modules.owners.service import get_owner_for_user
from app.modules.providers.service import get_provider_for_user
from app.modules.settings.service import (
    auto_approve_driver,
    auto_approve_vehicle,
    read_settings,
)
from app.modules.vehicles.model import Vehicle


OWNER_REVIEW_STATUSES = {
    OwnerVerificationStatus.PENDING,
    OwnerVerificationStatus.UNDER_REVIEW,
    OwnerVerificationStatus.CHANGES_REQUESTED,
}


async def _auto_approve_owner_when_enabled(
    session: AsyncSession,
    owner: VehicleOwner,
) -> bool:
    """Approve an owner when owner auto-approval is enabled.

    District, registered address, and owner documents are optional registration data and
    must not block entity auto-approval. Document auto-verification remains an independent
    setting: uploaded documents are verified when enabled, while missing documents do not
    keep the owner in the approval queue.
    """
    if owner.verification_status not in OWNER_REVIEW_STATUSES:
        return False

    settings = await read_settings(session)
    if not settings.approval.owner_auto_approve:
        return False
    if not owner.declaration_accepted:
        return False

    now = datetime.now(UTC)
    owner.verification_status = OwnerVerificationStatus.APPROVED
    owner.reviewed_at = now
    owner.review_notes = "Automatically approved by system configuration"

    if owner.tenant_id is not None:
        tenant = await session.get(Tenant, owner.tenant_id)
        if tenant is not None:
            tenant.status = TenantStatus.ACTIVE
    if owner.root_organization_id is not None:
        organization = await session.get(Organization, owner.root_organization_id)
        if organization is not None:
            organization.status = OrganizationStatus.ACTIVE

    if settings.approval.document_auto_verify:
        documents = list(
            await session.scalars(
                select(VehicleOwnerDocument).where(
                    VehicleOwnerDocument.owner_id == owner.id,
                    VehicleOwnerDocument.is_active.is_(True),
                )
            )
        )
        for document in documents:
            document.status = OwnerDocumentStatus.VERIFIED
            document.verified_at = now
            document.review_notes = "Automatically verified by system configuration"

    return True


async def apply_owner_auto_approval_after_request(
    request: Request,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[None]:
    yield

    candidates: dict[object, VehicleOwner] = {}

    owner = await get_owner_for_user(session, actor.id)
    if owner is not None and owner.verification_status in OWNER_REVIEW_STATUSES:
        candidates[owner.id] = owner

    # Provider-created owners belong to a different login identity than the VTS actor,
    # so looking up the owner by actor user ID misses them. Resolve the actor's provider
    # and approve its pending owner registrations explicitly.
    provider = await get_provider_for_user(session, actor.id)
    if provider is not None:
        provider_owners = list(
            await session.scalars(
                select(VehicleOwner).where(
                    VehicleOwner.created_by_provider_id == provider.id,
                    VehicleOwner.verification_status.in_(list(OWNER_REVIEW_STATUSES)),
                )
            )
        )
        for provider_owner in provider_owners:
            candidates[provider_owner.id] = provider_owner

    changed = False
    for candidate in candidates.values():
        changed = (await _auto_approve_owner_when_enabled(session, candidate)) or changed
    if changed:
        await session.commit()


async def apply_vehicle_auto_approval_after_request(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[None]:
    yield
    vehicles = list(
        await session.scalars(
            select(Vehicle).where(
                Vehicle.submitted_by_user_id == actor.id,
                Vehicle.verification_status.in_(
                    [
                        VehicleVerificationStatus.PENDING_VERIFICATION,
                        VehicleVerificationStatus.UNDER_REVIEW,
                    ]
                ),
            )
        )
    )
    changed = False
    for vehicle in vehicles:
        changed = (await auto_approve_vehicle(session, vehicle)) or changed
    if changed:
        await session.commit()


async def apply_driver_auto_approval_after_request(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[None]:
    yield
    driver = await get_driver_for_user(session, actor.id)
    if driver is None or driver.verification_status not in {
        DriverVerificationStatus.PENDING,
        DriverVerificationStatus.UNDER_REVIEW,
        DriverVerificationStatus.CHANGES_REQUESTED,
    }:
        return
    if await auto_approve_driver(session, driver):
        await session.commit()
