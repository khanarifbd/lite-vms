import uuid
from datetime import UTC, date, datetime
from enum import Enum
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EntityStatus, IdentifierType, UserRole, UserStatus
from app.core.database import get_session
from app.modules.assignments.duty_service import close_open_duty_sessions
from app.modules.assignments.model import DriverAssignment
from app.modules.audit.model import AuditLog
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.auth.service import (
    get_security,
    revoke_all_sessions,
    update_primary_identifier,
)
from app.modules.drivers.admin_schema import (
    AdminDriverAccountStatusUpdate,
    AdminDriverActionResult,
    AdminDriverDetail,
    AdminDriverHistoryEntry,
    AdminDriverProfileUpdate,
)
from app.modules.drivers.enums import DriverAssignmentStatus
from app.modules.drivers.model import Driver
from app.modules.drivers.service import build_driver_read

router = APIRouter(prefix="/admin/drivers", tags=["Admin Driver Management"])

ADMIN_HISTORY_ACTIONS = (
    "driver.admin_profile_updated",
    "driver.profile_change_submitted",
    "driver.profile_change_approve",
    "driver.profile_change_request_changes",
    "driver.profile_change_reject",
    "driver.account_activated",
    "driver.account_locked",
    "driver.account_suspended",
)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def audit_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    return value


async def get_driver_or_404(session: AsyncSession, driver_id: uuid.UUID) -> Driver:
    driver = await session.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver


async def get_driver_user(session: AsyncSession, driver: Driver) -> User:
    user = await session.get(User, driver.user_id)
    if user is None:
        raise HTTPException(status_code=409, detail="Driver account is missing")
    return user


async def build_admin_driver_detail(
    session: AsyncSession,
    driver: Driver,
) -> AdminDriverDetail:
    user = await get_driver_user(session, driver)
    entries = list(
        await session.scalars(
            select(AuditLog)
            .where(
                AuditLog.resource_type == "driver",
                AuditLog.resource_public_id == driver.id,
                AuditLog.action.in_(ADMIN_HISTORY_ACTIONS),
            )
            .order_by(AuditLog.created_at.desc())
            .limit(50)
        )
    )
    actor_ids = {entry.actor_user_id for entry in entries if entry.actor_user_id is not None}
    actors: dict[int, User] = {}
    if actor_ids:
        actors = {
            actor.id: actor
            for actor in list(await session.scalars(select(User).where(User.id.in_(actor_ids))))
        }
    history = [
        AdminDriverHistoryEntry(
            id=entry.public_id,
            action=entry.action,
            actor_name=(
                actors[entry.actor_user_id].display_name
                if entry.actor_user_id in actors
                else None
            ),
            reason=entry.reason,
            previous_values=entry.previous_values,
            new_values=entry.new_values,
            created_at=entry.created_at,
        )
        for entry in entries
    ]
    return AdminDriverDetail(
        driver=await build_driver_read(session, driver),
        pending_profile_changes=driver.pending_profile_changes,
        account_status=user.status,
        last_administrative_reason=(
            history[0].reason if history else driver.suspension_reason
        ),
        history=history,
    )


@router.get("/{driver_id}", response_model=AdminDriverDetail)
async def read_admin_driver(
    driver_id: uuid.UUID,
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminDriverDetail:
    driver = await get_driver_or_404(session, driver_id)
    return await build_admin_driver_detail(session, driver)


@router.patch("/{driver_id}/profile", response_model=AdminDriverActionResult)
async def update_driver_profile(
    driver_id: uuid.UUID,
    payload: AdminDriverProfileUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminDriverActionResult:
    driver = await get_driver_or_404(session, driver_id)
    user = await get_driver_user(session, driver)
    requested_changes = payload.model_dump(
        exclude_unset=True,
        exclude={"change_note"},
    )
    field_map = {"mobile": "phone"}
    previous_values: dict[str, Any] = {}
    new_values: dict[str, Any] = {}

    for payload_field, value in requested_changes.items():
        model_field = field_map.get(payload_field, payload_field)
        previous = getattr(driver, model_field)
        if previous == value:
            continue
        previous_values[payload_field] = audit_value(previous)
        new_values[payload_field] = audit_value(value)
        setattr(driver, model_field, value)

    if not new_values:
        raise HTTPException(status_code=409, detail="No driver profile values changed")

    try:
        if "full_name" in new_values:
            user.display_name = driver.full_name
        if "email" in new_values:
            await update_primary_identifier(
                session,
                user_id=user.id,
                identifier_type=IdentifierType.EMAIL,
                value=driver.email,
            )
        if "mobile" in new_values:
            await update_primary_identifier(
                session,
                user_id=user.id,
                identifier_type=IdentifierType.MOBILE,
                value=driver.phone,
            )
        user.updated_by_id = actor.id
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="driver.admin_profile_updated",
            resource_type="driver",
            resource_public_id=driver.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values=previous_values,
            new_values=new_values,
            reason=payload.change_note,
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email, mobile, or another unique driver value is already registered",
        ) from None

    await session.refresh(driver)
    return AdminDriverActionResult(
        detail=await build_admin_driver_detail(session, driver),
        message="Driver profile updated",
    )


@router.post("/{driver_id}/account-status", response_model=AdminDriverActionResult)
async def update_driver_account_status(
    driver_id: uuid.UUID,
    payload: AdminDriverAccountStatusUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminDriverActionResult:
    driver = await get_driver_or_404(session, driver_id)
    user = await get_driver_user(session, driver)
    security = await get_security(session, user.id)
    if security is None:
        raise HTTPException(status_code=409, detail="Driver security record is missing")
    if user.status not in {UserStatus.ACTIVE, UserStatus.LOCKED, UserStatus.SUSPENDED}:
        raise HTTPException(
            status_code=409,
            detail=f"Driver account cannot be changed from {user.status.value}",
        )

    target_status = {
        "activate": UserStatus.ACTIVE,
        "lock": UserStatus.LOCKED,
        "suspend": UserStatus.SUSPENDED,
    }[payload.action]
    if user.status == target_status:
        raise HTTPException(
            status_code=409,
            detail=f"Driver account is already {target_status.value}",
        )
    if payload.action == "lock" and user.status == UserStatus.SUSPENDED:
        raise HTTPException(
            status_code=409,
            detail="Activate the suspended driver account before locking it",
        )

    previous_values = {
        "account_status": user.status.value,
        "driver_status": driver.status.value,
        "suspension_reason": driver.suspension_reason,
    }
    user.status = target_status
    user.updated_by_id = actor.id
    security.failed_login_count = 0
    security.locked_until = None
    security.token_version += 1
    await revoke_all_sessions(session, user.id)

    if payload.action == "suspend":
        driver.status = EntityStatus.SUSPENDED
        driver.suspension_reason = payload.reason
        message = "Driver account suspended"
    elif payload.action == "lock":
        driver.suspension_reason = None
        message = "Driver account locked"
    else:
        driver.status = EntityStatus.ACTIVE
        driver.suspension_reason = None
        message = "Driver account activated"

    ended_assignments: list[DriverAssignment] = []
    if payload.action == "suspend":
        ended_assignments = list(
            await session.scalars(
                select(DriverAssignment).where(
                    DriverAssignment.driver_id == driver.id,
                    DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
                )
            )
        )
        ended_at = datetime.now(UTC)
        for assignment in ended_assignments:
            await close_open_duty_sessions(
                session,
                assignment_id=assignment.id,
                ended_at=ended_at,
                ended_by_user_id=actor.id,
                reason=payload.reason,
            )
            assignment.status = DriverAssignmentStatus.ENDED
            assignment.is_on_duty = False
            assignment.valid_to = ended_at
            assignment.notes = payload.reason

    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action={
            "activate": "driver.account_activated",
            "lock": "driver.account_locked",
            "suspend": "driver.account_suspended",
        }[payload.action],
        resource_type="driver",
        resource_public_id=driver.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values=previous_values,
        new_values={
            "account_status": user.status.value,
            "driver_status": driver.status.value,
            "ended_assignment_count": len(ended_assignments),
            "reason": payload.reason,
        },
        reason=payload.reason,
    )
    for assignment in ended_assignments:
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="driver.vehicle_assignment_ended_by_suspension",
            resource_type="driver_assignment",
            resource_public_id=assignment.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values={"status": DriverAssignmentStatus.ACTIVE.value},
            new_values={"status": assignment.status.value, "is_on_duty": False},
            reason=payload.reason,
        )
    await session.commit()
    await session.refresh(driver)
    return AdminDriverActionResult(
        detail=await build_admin_driver_detail(session, driver),
        message=message,
    )
