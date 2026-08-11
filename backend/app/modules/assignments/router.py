import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EntityStatus, UserRole, UserStatus, VehicleVerificationStatus
from app.core.database import get_session
from app.modules.assignments.duty_service import (
    close_open_duty_sessions,
    open_duty_session,
)
from app.modules.assignments.model import DriverAssignment, DriverDutySession
from app.modules.assignments.schema import (
    AssignmentCreate,
    AssignmentDutyStart,
    AssignmentEnd,
    AssignmentRead,
    DriverDutyHistoryPage,
    DriverDutySessionRead,
)
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User
from app.modules.drivers.enums import (
    DriverAssignmentStatus,
    DriverLicenceStatus,
    DriverVerificationStatus,
)
from app.modules.drivers.model import Driver, DriverLicence
from app.modules.drivers.service import (
    get_driver_for_user,
    owner_has_active_driver_link,
    provider_has_active_driver_link,
)
from app.modules.owners.service import (
    get_owner_for_user,
    has_active_provider_owner_link,
)
from app.modules.providers.service import get_provider_for_user
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/assignments", tags=["Driver Vehicle Assignments"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def actor_roles(user: User) -> set[str]:
    return set(getattr(user, "_role_codes", set()))


def is_assignment_admin(user: User) -> bool:
    return bool(
        actor_roles(user).intersection({UserRole.SUPER_ADMIN.value, UserRole.POLICE_ADMIN.value})
    )


async def resolve_assignment_scope(
    session: AsyncSession,
    *,
    actor: User,
    vehicle: Vehicle,
    driver: Driver,
) -> tuple[uuid.UUID, uuid.UUID | None]:
    if is_assignment_admin(actor):
        return vehicle.owner_id, None

    owner = await get_owner_for_user(session, actor.id)
    if owner is not None:
        if vehicle.owner_id != owner.id:
            raise HTTPException(status_code=403, detail="Vehicle does not belong to this owner")
        if not await owner_has_active_driver_link(
            session,
            owner_id=owner.id,
            driver_id=driver.id,
        ):
            raise HTTPException(status_code=403, detail="Active owner-driver link is required")
        return owner.id, None

    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=403, detail="Assignment scope is not available")
    if not await provider_has_active_driver_link(
        session,
        provider_id=provider.id,
        driver_id=driver.id,
    ):
        raise HTTPException(status_code=403, detail="Active provider-driver link is required")
    if not await has_active_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=vehicle.owner_id,
    ):
        raise HTTPException(
            status_code=403,
            detail="Provider must also have an active link with the vehicle owner",
        )
    if not await owner_has_active_driver_link(
        session,
        owner_id=vehicle.owner_id,
        driver_id=driver.id,
    ):
        raise HTTPException(
            status_code=403,
            detail="The driver must have an active link with the vehicle owner",
        )
    return vehicle.owner_id, provider.id


async def ensure_assignment_access(
    session: AsyncSession,
    *,
    actor: User,
    assignment: DriverAssignment,
) -> None:
    if is_assignment_admin(actor):
        return
    owner = await get_owner_for_user(session, actor.id)
    if owner is not None and owner.id == assignment.owner_id:
        return
    provider = await get_provider_for_user(session, actor.id)
    if provider is not None and provider.id == assignment.provider_id:
        return
    driver = await session.get(Driver, assignment.driver_id)
    if driver is not None and driver.user_id == actor.id:
        return
    raise HTTPException(status_code=403, detail="You cannot access this assignment")


@router.post("", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
async def assign_driver(
    payload: AssignmentCreate,
    request: Request,
    actor: Annotated[
        User,
        Depends(
            require_roles(
                UserRole.SUPER_ADMIN,
                UserRole.POLICE_ADMIN,
                UserRole.VTS_ADMIN,
                UserRole.VEHICLE_OWNER,
            )
        ),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverAssignment:
    vehicle = await session.get(Vehicle, payload.vehicle_id)
    driver = await session.get(Driver, payload.driver_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    if driver.status != EntityStatus.ACTIVE:
        raise HTTPException(
            status_code=409,
            detail="Driver account must be active before assignment",
        )
    driver_user = await session.get(User, driver.user_id)
    if driver_user is None or driver_user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=409,
            detail="Driver login account must be active before assignment",
        )
    if vehicle.verification_status != VehicleVerificationStatus.VERIFIED:
        raise HTTPException(status_code=409, detail="Vehicle must be verified before assignment")
    if driver.verification_status != DriverVerificationStatus.VERIFIED:
        raise HTTPException(status_code=409, detail="Driver must be verified before assignment")
    licence = await session.scalar(
        select(DriverLicence).where(DriverLicence.driver_id == driver.id)
    )
    if licence is None or licence.verification_status != DriverLicenceStatus.VERIFIED:
        raise HTTPException(status_code=409, detail="Driver licence must be verified")
    if licence.expiry_date < date.today():
        licence.verification_status = DriverLicenceStatus.EXPIRED
        await session.commit()
        raise HTTPException(status_code=409, detail="Driver licence has expired")

    owner_id, provider_id = await resolve_assignment_scope(
        session,
        actor=actor,
        vehicle=vehicle,
        driver=driver,
    )
    existing_driver_assignment = await session.scalar(
        select(DriverAssignment).where(
            DriverAssignment.driver_id == driver.id,
            DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
        )
    )
    if existing_driver_assignment is not None:
        raise HTTPException(
            status_code=409,
            detail="Driver already has an active vehicle assignment",
        )

    current_assignments = list(
        await session.scalars(
            select(DriverAssignment).where(
                DriverAssignment.vehicle_id == vehicle.id,
                DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
            )
        )
    )
    current_on_duty = next((item for item in current_assignments if item.is_on_duty), None)
    make_on_duty = payload.start_on_duty or current_on_duty is None
    now = datetime.now(UTC)

    if payload.start_on_duty and current_on_duty is not None:
        current_on_duty.is_on_duty = False
        await close_open_duty_sessions(
            session,
            vehicle_id=vehicle.id,
            ended_at=now,
            ended_by_user_id=actor.id,
            reason=payload.notes,
        )
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="driver.vehicle_duty_handed_over",
            resource_type="driver_assignment",
            resource_public_id=current_on_duty.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values={"is_on_duty": True},
            new_values={
                "is_on_duty": False,
                "driver_id": str(current_on_duty.driver_id),
                "vehicle_id": str(vehicle.id),
            },
            reason=payload.notes,
        )
        await session.flush()

    assignment = DriverAssignment(
        vehicle_id=vehicle.id,
        driver_id=driver.id,
        owner_id=owner_id,
        provider_id=provider_id,
        assigned_by_user_id=actor.id,
        valid_from=payload.valid_from or now,
        status=DriverAssignmentStatus.ACTIVE,
        is_on_duty=make_on_duty,
        notes=payload.notes,
    )
    session.add(assignment)
    try:
        await session.flush()
        if assignment.is_on_duty:
            open_duty_session(
                session,
                assignment=assignment,
                started_at=now,
                started_by_user_id=actor.id,
                reason=payload.notes,
                source="assignment",
            )
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="driver.vehicle_assigned",
            resource_type="driver_assignment",
            resource_public_id=assignment.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "driver_id": str(driver.id),
                "vehicle_id": str(vehicle.id),
                "provider_id": str(provider_id) if provider_id else None,
                "is_on_duty": assignment.is_on_duty,
            },
            reason=payload.notes,
        )
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Driver assignment or vehicle duty changed concurrently; reload and try again",
        ) from None
    await session.refresh(assignment)
    return assignment


@router.post("/{assignment_id}/start-duty", response_model=AssignmentRead)
async def start_driver_duty(
    assignment_id: uuid.UUID,
    payload: AssignmentDutyStart,
    request: Request,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverAssignment:
    assignment = await session.get(DriverAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Driver assignment not found")
    await ensure_assignment_access(session, actor=actor, assignment=assignment)
    if assignment.status != DriverAssignmentStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Driver assignment is not active")
    if assignment.is_on_duty:
        raise HTTPException(status_code=409, detail="Driver is already on duty for this vehicle")

    driver = await session.get(Driver, assignment.driver_id)
    if driver is None or driver.status != EntityStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Driver account must be active to start duty")
    driver_user = await session.get(User, driver.user_id)
    if driver_user is None or driver_user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=409,
            detail="Driver login account must be active to start duty",
        )
    if driver.verification_status != DriverVerificationStatus.VERIFIED:
        raise HTTPException(status_code=409, detail="Driver must be verified to start duty")
    licence = await session.scalar(
        select(DriverLicence).where(DriverLicence.driver_id == driver.id)
    )
    if licence is None or licence.verification_status != DriverLicenceStatus.VERIFIED:
        raise HTTPException(status_code=409, detail="Driver licence must be verified")
    if licence.expiry_date < date.today():
        licence.verification_status = DriverLicenceStatus.EXPIRED
        await session.commit()
        raise HTTPException(status_code=409, detail="Driver licence has expired")

    now = datetime.now(UTC)
    await close_open_duty_sessions(
        session,
        vehicle_id=assignment.vehicle_id,
        ended_at=now,
        ended_by_user_id=actor.id,
        reason=payload.reason,
    )
    previous_assignments = list(
        await session.scalars(
            select(DriverAssignment).where(
                DriverAssignment.vehicle_id == assignment.vehicle_id,
                DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
                DriverAssignment.is_on_duty.is_(True),
                DriverAssignment.id != assignment.id,
            )
        )
    )
    for previous in previous_assignments:
        previous.is_on_duty = False
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="driver.vehicle_duty_handed_over",
            resource_type="driver_assignment",
            resource_public_id=previous.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values={"is_on_duty": True},
            new_values={
                "is_on_duty": False,
                "driver_id": str(previous.driver_id),
                "vehicle_id": str(previous.vehicle_id),
                "handed_over_to_assignment_id": str(assignment.id),
            },
            reason=payload.reason,
        )

    if previous_assignments:
        await session.flush()

    assignment.is_on_duty = True
    assignment.notes = payload.reason
    open_duty_session(
        session,
        assignment=assignment,
        started_at=now,
        started_by_user_id=actor.id,
        reason=payload.reason,
        source="handover",
    )
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action="driver.vehicle_duty_started",
        resource_type="driver_assignment",
        resource_public_id=assignment.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={"is_on_duty": False},
        new_values={
            "is_on_duty": True,
            "driver_id": str(assignment.driver_id),
            "vehicle_id": str(assignment.vehicle_id),
            "replaced_assignment_ids": [str(item.id) for item in previous_assignments],
        },
        reason=payload.reason,
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Vehicle duty changed concurrently; reload and try again",
        ) from None
    await session.refresh(assignment)
    return assignment


@router.post("/{assignment_id}/end", response_model=AssignmentRead)
async def end_driver_assignment(
    assignment_id: uuid.UUID,
    payload: AssignmentEnd,
    request: Request,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverAssignment:
    assignment = await session.get(DriverAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Driver assignment not found")
    await ensure_assignment_access(session, actor=actor, assignment=assignment)
    if assignment.status != DriverAssignmentStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Driver assignment is not active")

    was_on_duty = assignment.is_on_duty
    ended_at = datetime.now(UTC)
    if was_on_duty:
        await close_open_duty_sessions(
            session,
            assignment_id=assignment.id,
            ended_at=ended_at,
            ended_by_user_id=actor.id,
            reason=payload.notes,
        )
    assignment.status = DriverAssignmentStatus.ENDED
    assignment.is_on_duty = False
    assignment.valid_to = ended_at
    assignment.notes = payload.notes
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action="driver.vehicle_assignment_ended",
        resource_type="driver_assignment",
        resource_public_id=assignment.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={
            "status": DriverAssignmentStatus.ACTIVE.value,
            "is_on_duty": was_on_duty,
        },
        new_values={
            "status": assignment.status.value,
            "is_on_duty": False,
            "driver_id": str(assignment.driver_id),
            "vehicle_id": str(assignment.vehicle_id),
        },
        reason=payload.notes,
    )
    await session.commit()
    await session.refresh(assignment)
    return assignment


def duty_duration_seconds(
    duty_session: DriverDutySession,
    *,
    now: datetime,
) -> int:
    reference_end = duty_session.ended_at or now
    if duty_session.started_at.tzinfo is None and reference_end.tzinfo is not None:
        reference_end = reference_end.replace(tzinfo=None)
    return max(0, int((reference_end - duty_session.started_at).total_seconds()))


@router.get("/duty-history", response_model=DriverDutyHistoryPage)
async def list_driver_duty_history(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    driver_id: Annotated[uuid.UUID | None, Query()] = None,
    vehicle_id: Annotated[uuid.UUID | None, Query()] = None,
    from_at: Annotated[datetime | None, Query()] = None,
    to_at: Annotated[datetime | None, Query()] = None,
    at: Annotated[datetime | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=160)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> DriverDutyHistoryPage:
    if from_at is not None and to_at is not None and from_at > to_at:
        raise HTTPException(status_code=422, detail="from_at must be before to_at")

    conditions = []
    if is_assignment_admin(actor):
        pass
    else:
        owner = await get_owner_for_user(session, actor.id)
        if owner is not None:
            conditions.append(DriverDutySession.owner_id == owner.id)
        else:
            provider = await get_provider_for_user(session, actor.id)
            if provider is not None:
                conditions.append(DriverAssignment.provider_id == provider.id)
            else:
                driver = await get_driver_for_user(session, actor.id)
                if driver is None:
                    raise HTTPException(
                        status_code=403,
                        detail="Duty history scope is not available",
                    )
                conditions.append(DriverDutySession.driver_id == driver.id)

    if driver_id is not None:
        conditions.append(DriverDutySession.driver_id == driver_id)
    if vehicle_id is not None:
        conditions.append(DriverDutySession.vehicle_id == vehicle_id)
    if at is not None:
        conditions.extend(
            [
                DriverDutySession.started_at <= at,
                or_(
                    DriverDutySession.ended_at.is_(None),
                    DriverDutySession.ended_at > at,
                ),
            ]
        )
    else:
        if from_at is not None:
            conditions.append(
                or_(
                    DriverDutySession.ended_at.is_(None),
                    DriverDutySession.ended_at >= from_at,
                )
            )
        if to_at is not None:
            conditions.append(DriverDutySession.started_at <= to_at)

    normalized_search = search.strip() if search else ""
    if normalized_search:
        pattern = f"%{normalized_search}%"
        conditions.append(
            or_(
                Driver.full_name.ilike(pattern),
                Driver.driver_code.ilike(pattern),
                Vehicle.registration_number.ilike(pattern),
                Vehicle.registration_number_display.ilike(pattern),
            )
        )

    base_query = (
        select(
            DriverDutySession,
            Driver.full_name,
            Driver.driver_code,
            Vehicle.registration_number,
            Vehicle.registration_number_display,
        )
        .join(
            DriverAssignment,
            DriverAssignment.id == DriverDutySession.assignment_id,
        )
        .join(Driver, Driver.id == DriverDutySession.driver_id)
        .join(Vehicle, Vehicle.id == DriverDutySession.vehicle_id)
        .where(*conditions)
    )
    total = int(
        await session.scalar(
            select(func.count(DriverDutySession.id))
            .select_from(DriverDutySession)
            .join(
                DriverAssignment,
                DriverAssignment.id == DriverDutySession.assignment_id,
            )
            .join(Driver, Driver.id == DriverDutySession.driver_id)
            .join(Vehicle, Vehicle.id == DriverDutySession.vehicle_id)
            .where(*conditions)
        )
        or 0
    )
    rows = (
        await session.execute(
            base_query.order_by(
                DriverDutySession.started_at.desc(),
                DriverDutySession.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
    ).all()
    now = datetime.now(UTC)
    items = [
        DriverDutySessionRead(
            id=duty_session.id,
            assignment_id=duty_session.assignment_id,
            vehicle_id=duty_session.vehicle_id,
            vehicle_registration=registration_display or registration_number,
            driver_id=duty_session.driver_id,
            driver_code=driver_code,
            driver_name=driver_name,
            owner_id=duty_session.owner_id,
            started_at=duty_session.started_at,
            ended_at=duty_session.ended_at,
            duration_seconds=duty_duration_seconds(duty_session, now=now),
            is_open=duty_session.ended_at is None,
            started_by_user_id=duty_session.started_by_user_id,
            ended_by_user_id=duty_session.ended_by_user_id,
            start_reason=duty_session.start_reason,
            end_reason=duty_session.end_reason,
            source=duty_session.source,
        )
        for (
            duty_session,
            driver_name,
            driver_code,
            registration_number,
            registration_display,
        ) in rows
    ]
    return DriverDutyHistoryPage(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("", response_model=list[AssignmentRead])
async def list_assignments(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    assignment_status: Annotated[
        DriverAssignmentStatus | None,
        Query(alias="status"),
    ] = None,
) -> list[DriverAssignment]:
    query = select(DriverAssignment)

    if not is_assignment_admin(actor):
        owner = await get_owner_for_user(session, actor.id)
        if owner is not None:
            query = query.where(DriverAssignment.owner_id == owner.id)
        else:
            provider = await get_provider_for_user(session, actor.id)
            if provider is not None:
                query = query.where(DriverAssignment.provider_id == provider.id)
            else:
                driver = await get_driver_for_user(session, actor.id)
                if driver is None:
                    raise HTTPException(status_code=403, detail="Assignment scope is not available")
                query = query.where(DriverAssignment.driver_id == driver.id)

    if assignment_status is not None:
        query = query.where(DriverAssignment.status == assignment_status)

    return list(
        await session.scalars(
            query.order_by(DriverAssignment.valid_from.desc()).limit(500)
        )
    )


@router.get("/vehicle/{vehicle_id}", response_model=list[AssignmentRead])
async def list_vehicle_assignments(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[DriverAssignment]:
    assignments = list(
        await session.scalars(
            select(DriverAssignment)
            .where(DriverAssignment.vehicle_id == vehicle_id)
            .order_by(DriverAssignment.valid_from.desc())
        )
    )
    if assignments:
        await ensure_assignment_access(session, actor=actor, assignment=assignments[0])
    return assignments


@router.get("/driver/{driver_id}", response_model=list[AssignmentRead])
async def list_driver_assignments(
    driver_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[DriverAssignment]:
    assignments = list(
        await session.scalars(
            select(DriverAssignment)
            .where(DriverAssignment.driver_id == driver_id)
            .order_by(DriverAssignment.valid_from.desc())
        )
    )
    if assignments:
        await ensure_assignment_access(session, actor=actor, assignment=assignments[0])
    return assignments
