import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EntityStatus, OwnerVerificationStatus, UserRole
from app.core.database import get_session
from app.modules.assignments.duty_service import close_open_duty_sessions
from app.modules.assignments.model import DriverAssignment
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.drivers.connection_schema import (
    DriverOwnerLinkRequest,
    OwnerDriverLinkActionResult,
    OwnerDriverLinkUnlink,
)
from app.modules.drivers.enums import (
    DriverAssignmentStatus,
    DriverLinkDecision,
    DriverLinkSource,
    DriverLinkStatus,
)
from app.modules.drivers.model import Driver, VehicleOwnerDriverLink
from app.modules.drivers.schema import DriverLinkRead, DriverLinkResponse
from app.modules.drivers.service import (
    build_owner_link_read,
    create_or_reopen_owner_driver_link,
    get_driver_for_user,
)
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import get_owner_for_user

router = APIRouter(prefix="/drivers/owner-links", tags=["Owner Driver Consent"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post("/driver-request", response_model=DriverLinkRead)
async def driver_request_owner_link(
    payload: DriverOwnerLinkRequest,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.DRIVER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverLinkRead:
    driver = await get_driver_for_user(session, actor.id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    if driver.status != EntityStatus.ACTIVE:
        raise HTTPException(
            status_code=409,
            detail="Only an active driver can request an owner link",
        )

    owner_code = payload.owner_code.strip().upper()
    owner = await session.scalar(
        select(VehicleOwner).where(VehicleOwner.owner_code == owner_code)
    )
    if owner is None:
        raise HTTPException(status_code=404, detail="No vehicle owner matches this owner code")
    if (
        owner.verification_status != OwnerVerificationStatus.APPROVED
        or owner.status != EntityStatus.ACTIVE
    ):
        raise HTTPException(status_code=409, detail="The vehicle owner is not currently available")

    try:
        link, changed = await create_or_reopen_owner_driver_link(
            session,
            owner_id=owner.id,
            driver_id=driver.id,
            requested_by=DriverLinkSource.DRIVER,
            requested_by_user_id=actor.id,
        )
        if not changed:
            await session.rollback()
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "owner_driver_link_exists",
                    "message": "A connection with this vehicle owner already exists",
                    "status": link.status.value,
                },
            )
        link.reason = payload.notes
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action="driver.owner_link_requested",
            resource_type="vehicle_owner_driver_link",
            resource_public_id=link.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "owner_id": str(owner.id),
                "driver_id": str(driver.id),
                "requested_by": DriverLinkSource.DRIVER.value,
                "status": link.status.value,
            },
            reason=payload.notes,
        )
        await session.commit()
    except HTTPException:
        raise
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="The owner connection request could not be created",
        ) from None

    await session.refresh(link)
    return await build_owner_link_read(session, link)


@router.post("/{link_id}/respond", response_model=DriverLinkRead)
async def owner_respond_to_driver_link(
    link_id: uuid.UUID,
    payload: DriverLinkResponse,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverLinkRead:
    owner = await get_owner_for_user(session, actor.id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    if (
        owner.verification_status != OwnerVerificationStatus.APPROVED
        or owner.status != EntityStatus.ACTIVE
    ):
        raise HTTPException(status_code=409, detail="Vehicle owner account is not active")
    link = await session.get(VehicleOwnerDriverLink, link_id)
    if link is None or link.owner_id != owner.id:
        raise HTTPException(status_code=404, detail="Owner-driver link not found")
    if link.status != DriverLinkStatus.PENDING_ORGANIZATION_APPROVAL:
        raise HTTPException(status_code=409, detail="This link is not awaiting owner approval")

    previous_status = link.status
    link.status = (
        DriverLinkStatus.ACTIVE
        if payload.decision == DriverLinkDecision.APPROVE
        else DriverLinkStatus.REJECTED
    )
    link.responded_by_user_id = actor.id
    link.responded_at = datetime.now(UTC)
    link.reason = payload.notes
    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action=(
            "driver.owner_link_approved"
            if payload.decision == DriverLinkDecision.APPROVE
            else "driver.owner_link_rejected"
        ),
        resource_type="vehicle_owner_driver_link",
        resource_public_id=link.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={"status": previous_status.value},
        new_values={"status": link.status.value, "driver_id": str(link.driver_id)},
        reason=payload.notes,
    )
    await session.commit()
    await session.refresh(link)
    return await build_owner_link_read(session, link)


@router.post("/{link_id}/unlink", response_model=OwnerDriverLinkActionResult)
async def end_owner_driver_link(
    link_id: uuid.UUID,
    payload: OwnerDriverLinkUnlink,
    request: Request,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.VEHICLE_OWNER, UserRole.DRIVER)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerDriverLinkActionResult:
    link = await session.get(VehicleOwnerDriverLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Owner-driver link not found")
    owner = await session.get(VehicleOwner, link.owner_id)
    driver = await session.get(Driver, link.driver_id)
    if owner is None or driver is None:
        raise HTTPException(status_code=409, detail="Owner-driver identity is incomplete")

    actor_owner = await get_owner_for_user(session, actor.id)
    actor_driver = await get_driver_for_user(session, actor.id)
    if not (
        (actor_owner is not None and actor_owner.id == owner.id)
        or (actor_driver is not None and actor_driver.id == driver.id)
    ):
        raise HTTPException(
            status_code=403,
            detail="Only the linked owner or driver can end this link",
        )
    if link.status not in {
        DriverLinkStatus.PENDING_DRIVER_APPROVAL,
        DriverLinkStatus.PENDING_ORGANIZATION_APPROVAL,
        DriverLinkStatus.ACTIVE,
        DriverLinkStatus.SUSPENDED,
    }:
        raise HTTPException(status_code=409, detail="This owner-driver link is already closed")

    previous_status = link.status
    now = datetime.now(UTC)
    assignments: list[DriverAssignment] = []
    if previous_status in {DriverLinkStatus.ACTIVE, DriverLinkStatus.SUSPENDED}:
        assignments = list(
            await session.scalars(
                select(DriverAssignment).where(
                    DriverAssignment.owner_id == owner.id,
                    DriverAssignment.driver_id == driver.id,
                    DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
                )
            )
        )
        for assignment in assignments:
            await close_open_duty_sessions(
                session,
                assignment_id=assignment.id,
                ended_at=now,
                ended_by_user_id=actor.id,
                reason=payload.reason,
            )
            assignment.status = DriverAssignmentStatus.ENDED
            assignment.is_on_duty = False
            assignment.valid_to = now
            assignment.notes = payload.reason

    link.status = DriverLinkStatus.ENDED
    link.ended_at = now
    link.reason = payload.reason
    action = (
        "driver.owner_link_cancelled"
        if previous_status
        in {
            DriverLinkStatus.PENDING_DRIVER_APPROVAL,
            DriverLinkStatus.PENDING_ORGANIZATION_APPROVAL,
        }
        else "driver.owner_link_ended"
    )
    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action=action,
        resource_type="vehicle_owner_driver_link",
        resource_public_id=link.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={"status": previous_status.value},
        new_values={
            "status": link.status.value,
            "driver_id": str(driver.id),
            "owner_id": str(owner.id),
            "ended_assignment_count": len(assignments),
        },
        reason=payload.reason,
    )
    for assignment in assignments:
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action="driver.vehicle_assignment_ended_by_unlink",
            resource_type="driver_assignment",
            resource_public_id=assignment.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values={"status": DriverAssignmentStatus.ACTIVE.value},
            new_values={"status": assignment.status.value, "is_on_duty": False},
            reason=payload.reason,
        )
    await session.commit()
    await session.refresh(link)
    return OwnerDriverLinkActionResult(
        link=await build_owner_link_read(session, link),
        ended_assignment_count=len(assignments),
        message=(
            "Connection request cancelled"
            if action == "driver.owner_link_cancelled"
            else "Owner-driver connection ended"
        ),
    )
