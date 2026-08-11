import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    DocumentStatus,
    UserRole,
    VehicleReviewDecision,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.audit.model import AuditLog
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.documents.model import VehicleDocument
from app.modules.owners.model import VehicleOwner
from app.modules.qr_verification.model import VehicleQRToken
from app.modules.vehicles.admin_schema import (
    AdminVehicleAuditEvent,
    AdminVehicleDetail,
    AdminVehicleQRStatus,
    AdminVehicleReview,
)
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.normalization import (
    normalize_bangladesh_registration,
    normalize_vehicle_serial,
)
from app.modules.vehicles.schema import VehiclePage, VehicleRead
from app.modules.vehicles.service import build_vehicle_read
from app.modules.vehicles.setup_service import (
    activate_pending_driver_assignment,
    reject_pending_vehicle_setups,
)

router = APIRouter(prefix="/admin/vehicles", tags=["Admin Vehicle Verification"])

ADMIN_ROLES = (UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)


@router.get("", response_model=VehiclePage)
async def list_admin_vehicles(
    _: Annotated[User, Depends(require_roles(*ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    verification_status: Annotated[
        VehicleVerificationStatus | None,
        Query(alias="status"),
    ] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
) -> VehiclePage:
    query = select(Vehicle)
    count_query = select(func.count(Vehicle.id))

    if verification_status is not None:
        query = query.where(Vehicle.verification_status == verification_status)
        count_query = count_query.where(Vehicle.verification_status == verification_status)

    if search:
        raw = search.strip()
        candidates = {raw.upper()}
        try:
            candidates.add(normalize_bangladesh_registration(raw))
        except ValueError:
            pass
        try:
            candidates.add(normalize_vehicle_serial(raw))
        except ValueError:
            pass
        patterns = [f"%{candidate.lower()}%" for candidate in candidates]
        condition = or_(
            *[
                func.lower(Vehicle.registration_number).like(pattern)
                for pattern in patterns
            ],
            *[
                func.lower(Vehicle.chassis_number).like(pattern)
                for pattern in patterns
            ],
            *[
                func.lower(Vehicle.engine_number).like(pattern)
                for pattern in patterns
            ],
            func.lower(Vehicle.registration_number_display).like(f"%{raw.lower()}%"),
            func.lower(Vehicle.brand).like(f"%{raw.lower()}%"),
            func.lower(Vehicle.model).like(f"%{raw.lower()}%"),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)

    vehicles = list(
        await session.scalars(
            query.order_by(Vehicle.updated_at.desc()).offset(offset).limit(limit)
        )
    )
    return VehiclePage(
        items=[await build_vehicle_read(session, vehicle) for vehicle in vehicles],
        total=int(await session.scalar(count_query) or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/{vehicle_id}", response_model=AdminVehicleDetail)
async def read_admin_vehicle(
    vehicle_id: uuid.UUID,
    _: Annotated[User, Depends(require_roles(*ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminVehicleDetail:
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    qr_token = await session.scalar(
        select(VehicleQRToken).where(VehicleQRToken.vehicle_id == vehicle.id)
    )
    actor_name = (
        select(User.display_name)
        .where(User.id == AuditLog.actor_user_id)
        .correlate(AuditLog)
        .scalar_subquery()
    )
    history_rows = (
        await session.execute(
            select(
                AuditLog.public_id.label("id"),
                AuditLog.action,
                actor_name.label("actor_name"),
                AuditLog.reason,
                AuditLog.created_at,
            )
            .where(
                AuditLog.resource_type == "vehicle",
                AuditLog.resource_public_id == vehicle.id,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(30)
        )
    ).all()

    return AdminVehicleDetail(
        vehicle=await build_vehicle_read(session, vehicle),
        qr=AdminVehicleQRStatus(
            id=qr_token.id if qr_token else None,
            token=qr_token.token if qr_token else None,
            is_active=bool(qr_token and qr_token.is_active),
            issued_at=qr_token.issued_at if qr_token else None,
        ),
        review_history=[
            AdminVehicleAuditEvent.model_validate(row._mapping) for row in history_rows
        ],
    )


@router.post("/{vehicle_id}/review", response_model=VehicleRead)
async def review_admin_vehicle(
    vehicle_id: uuid.UUID,
    payload: AdminVehicleReview,
    actor: Annotated[User, Depends(require_roles(*ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise HTTPException(status_code=409, detail="Vehicle owner is missing")

    documents = list(
        await session.scalars(
            select(VehicleDocument).where(
                VehicleDocument.vehicle_id == vehicle.id,
                VehicleDocument.is_active.is_(True),
            )
        )
    )
    now = datetime.now(UTC)
    vehicle.reviewed_by_user_id = actor.id
    vehicle.reviewed_at = now
    vehicle.review_notes = payload.notes
    driver_activation_status: str | None = None

    if payload.decision == VehicleReviewDecision.APPROVE:
        vehicle.verification_status = VehicleVerificationStatus.VERIFIED
        for document in documents:
            document.status = DocumentStatus.VALID
            document.verified_by_user_id = actor.id
            document.verified_at = now
            document.review_notes = payload.notes
        pending_driver = await activate_pending_driver_assignment(session, vehicle=vehicle)
        driver_activation_status = (
            pending_driver.status.value if pending_driver is not None else None
        )
    elif payload.decision == VehicleReviewDecision.REQUEST_CHANGES:
        vehicle.verification_status = VehicleVerificationStatus.CHANGES_REQUESTED
        for document in documents:
            document.status = DocumentStatus.PENDING_VERIFICATION
            document.verified_by_user_id = None
            document.verified_at = None
            document.review_notes = payload.notes
    else:
        vehicle.verification_status = VehicleVerificationStatus.REJECTED
        for document in documents:
            document.status = DocumentStatus.REVOKED
            document.review_notes = payload.notes
        await reject_pending_vehicle_setups(
            session,
            vehicle=vehicle,
            reason=f"Vehicle registration rejected: {payload.notes}",
        )

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action=f"vehicle.registration_{payload.decision.value}",
        resource_type="vehicle",
        resource_public_id=vehicle.id,
        new_values={
            "verification_status": vehicle.verification_status.value,
            "review_notes": payload.notes,
            "document_count": len(documents),
            "driver_assignment_status": driver_activation_status,
        },
        reason=payload.notes,
    )
    await session.commit()
    await session.refresh(vehicle)
    return await build_vehicle_read(session, vehicle)
