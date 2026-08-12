import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    OwnerVerificationStatus,
    ProviderStatus,
    UserRole,
    VehicleReviewDecision,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User
from app.modules.owners.enums import OwnerProviderLinkStatus
from app.modules.owners.model import VehicleOwner, VTSProviderOwnerLink
from app.modules.owners.service import (
    get_owner_for_user,
    has_active_provider_owner_link,
    user_can_access_owner,
)
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user
from app.modules.qr_verification.model import VehicleQRToken
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.normalization import (
    normalize_bangladesh_registration,
    normalize_vehicle_serial,
)
from app.modules.vehicles.schema import (
    VehicleCreate,
    VehiclePage,
    VehicleRead,
    VehicleReview,
    VehicleUpdate,
)
from app.modules.vehicles.service import (
    build_vehicle_read,
    can_manage_all_vehicles,
    user_can_access_vehicle,
)
from app.modules.vehicles.setup_service import (
    activate_pending_driver_assignment,
    create_initial_driver_assignment,
    create_initial_tracking_assignment,
    reject_pending_vehicle_setups,
)

router = APIRouter(prefix="/vehicles", tags=["Vehicle Registration"])

SENSITIVE_VEHICLE_FIELDS = {
    "registration_number",
    "chassis_number",
    "engine_number",
    "vehicle_type",
}


def normalize_vehicle_identity(value: str) -> str:
    """Backward-compatible alias for serial identities used by older callers."""
    return normalize_vehicle_serial(value)


async def resolve_vehicle_owner(
    session: AsyncSession,
    *,
    actor: User,
    owner_id: uuid.UUID | None,
) -> tuple[VehicleOwner, VTSProvider | None]:
    roles = set(getattr(actor, "_role_codes", set()))
    is_platform_admin = bool(
        roles.intersection({UserRole.SUPER_ADMIN.value, UserRole.POLICE_ADMIN.value})
    )
    if owner_id is not None:
        owner = await session.get(VehicleOwner, owner_id)
        if owner is None:
            raise HTTPException(status_code=404, detail="Vehicle owner not found")
        if is_platform_admin:
            return owner, None
        if await user_can_access_owner(session, user_id=actor.id, owner=owner):
            return owner, None
        provider = await get_provider_for_user(session, actor.id)
        if provider is None or provider.status != ProviderStatus.APPROVED:
            raise HTTPException(status_code=403, detail="Approved VTS provider required")
        if await has_active_provider_owner_link(
            session,
            provider_id=provider.id,
            owner_id=owner.id,
        ):
            return owner, provider
        raise HTTPException(
            status_code=403,
            detail="An active owner-provider link is required to manage this vehicle",
        )

    if UserRole.VTS_ADMIN.value in roles:
        raise HTTPException(
            status_code=422,
            detail="VTS providers must supply owner_id from their active owner link",
        )
    owner = await get_owner_for_user(session, actor.id)
    if owner is None:
        raise HTTPException(
            status_code=404,
            detail="Vehicle-owner registration not found; complete owner registration first",
        )
    return owner, None


async def find_identity_conflict(
    session: AsyncSession,
    *,
    registration_number: str | None,
    chassis_number: str | None,
    engine_number: str | None,
    exclude_vehicle_id: uuid.UUID | None = None,
) -> Vehicle | None:
    conditions = []
    if registration_number:
        conditions.append(Vehicle.registration_number == registration_number)
    if chassis_number:
        conditions.append(Vehicle.chassis_number == chassis_number)
    if engine_number:
        conditions.append(Vehicle.engine_number == engine_number)
    if not conditions:
        return None
    query = select(Vehicle).where(or_(*conditions))
    if exclude_vehicle_id is not None:
        query = query.where(Vehicle.id != exclude_vehicle_id)
    return await session.scalar(query)


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    payload: VehicleCreate,
    actor: Annotated[
        User,
        Depends(
            require_roles(
                UserRole.SUPER_ADMIN,
                UserRole.POLICE_ADMIN,
                UserRole.VEHICLE_OWNER,
                UserRole.VTS_ADMIN,
            )
        ),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    owner, provider = await resolve_vehicle_owner(
        session,
        actor=actor,
        owner_id=payload.owner_id,
    )
    if owner.verification_status != OwnerVerificationStatus.APPROVED:
        raise HTTPException(
            status_code=403,
            detail="Vehicle owner must be approved before registering vehicles",
        )

    registration_number = normalize_bangladesh_registration(payload.registration_number)
    chassis_number = normalize_vehicle_serial(payload.chassis_number)
    engine_number = (
        normalize_vehicle_serial(payload.engine_number) if payload.engine_number else None
    )
    conflict = await find_identity_conflict(
        session,
        registration_number=registration_number,
        chassis_number=chassis_number,
        engine_number=engine_number,
    )
    if conflict is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "vehicle_identity_exists",
                "message": "Vehicle identity already exists in the global registry",
                "vehicle_id": str(conflict.id),
                "owner_id": str(conflict.owner_id),
            },
        )

    values = payload.model_dump(
        exclude={
            "owner_id",
            "registration_number",
            "registration_number_display",
            "registered_owner_name",
            "chassis_number",
            "engine_number",
            "tracking_setup",
            "current_driver",
        }
    )
    vehicle = Vehicle(
        **values,
        registration_number=registration_number,
        registration_number_display=(
            payload.registration_number_display or payload.registration_number.strip()
        ),
        registered_owner_name=(payload.registered_owner_name or "").strip() or owner.name,
        chassis_number=chassis_number,
        engine_number=engine_number,
        owner_id=owner.id,
        created_by_provider_id=provider.id if provider else None,
        submitted_by_user_id=actor.id,
        verification_status=VehicleVerificationStatus.PENDING_VERIFICATION,
    )
    session.add(vehicle)
    try:
        await session.flush()
        session.add(VehicleQRToken(vehicle_id=vehicle.id, token=secrets.token_urlsafe(32)))
        tracking_assignment = await create_initial_tracking_assignment(
            session,
            actor=actor,
            vehicle=vehicle,
            owner=owner,
            setup=payload.tracking_setup,
        )
        driver_assignment = await create_initial_driver_assignment(
            session,
            actor=actor,
            vehicle=vehicle,
            owner=owner,
            setup=payload.current_driver,
        )
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action="vehicle.registration_submitted",
            resource_type="vehicle",
            resource_public_id=vehicle.id,
            new_values={
                "registration_number": vehicle.registration_number,
                "owner_id": str(owner.id),
                "created_by_provider_id": str(provider.id) if provider else None,
                "tracking_assignment_id": (
                    str(tracking_assignment.id) if tracking_assignment else None
                ),
                "tracking_provider_id": (
                    str(tracking_assignment.provider_id)
                    if tracking_assignment and tracking_assignment.provider_id
                    else None
                ),
                "driver_assignment_id": (
                    str(driver_assignment.id) if driver_assignment else None
                ),
                "current_driver_id": (
                    str(driver_assignment.driver_id) if driver_assignment else None
                ),
                "verification_status": vehicle.verification_status.value,
            },
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "code": "vehicle_or_assignment_identity_exists",
                "message": "Vehicle, device, or assignment identity already exists",
            },
        ) from exc

    await session.refresh(vehicle)
    return await build_vehicle_read(session, vehicle)


def vehicle_scope_query(actor: User, provider: VTSProvider | None, owner: VehicleOwner | None):
    query = select(Vehicle)
    if can_manage_all_vehicles(actor):
        return query
    if owner is not None:
        return query.where(Vehicle.owner_id == owner.id)
    if provider is not None:
        linked_owner_ids = select(VTSProviderOwnerLink.owner_id).where(
            VTSProviderOwnerLink.provider_id == provider.id,
            VTSProviderOwnerLink.status == OwnerProviderLinkStatus.ACTIVE,
        )
        return query.where(Vehicle.owner_id.in_(linked_owner_ids))
    return query.where(Vehicle.id.is_(None))


@router.get("", response_model=VehiclePage)
async def list_vehicles(
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    owner_id: uuid.UUID | None = None,
    verification_status: Annotated[
        VehicleVerificationStatus | None,
        Query(alias="status"),
    ] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> VehiclePage:
    provider = await get_provider_for_user(session, actor.id)
    owner = await get_owner_for_user(session, actor.id)
    query = vehicle_scope_query(actor, provider, owner)

    if owner_id is not None:
        target_owner, _ = await resolve_vehicle_owner(
            session, actor=actor, owner_id=owner_id
        )
        query = query.where(Vehicle.owner_id == target_owner.id)
    if verification_status is not None:
        query = query.where(Vehicle.verification_status == verification_status)
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
        query = query.where(
            or_(
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
                func.lower(Vehicle.registration_number_display).like(
                    f"%{raw.lower()}%"
                ),
                func.lower(Vehicle.brand).like(f"%{raw.lower()}%"),
                func.lower(Vehicle.model).like(f"%{raw.lower()}%"),
            )
        )

    total = int(
        await session.scalar(select(func.count()).select_from(query.subquery())) or 0
    )
    vehicles = list(
        await session.scalars(
            query.order_by(Vehicle.registration_number, Vehicle.id)
            .offset(offset)
            .limit(limit)
        )
    )
    return VehiclePage(
        items=[await build_vehicle_read(session, vehicle) for vehicle in vehicles],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/{vehicle_id}", response_model=VehicleRead)
async def get_vehicle(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not await user_can_access_vehicle(session, user=actor, vehicle=vehicle):
        raise HTTPException(status_code=403, detail="You cannot access this vehicle")
    return await build_vehicle_read(session, vehicle)


@router.patch("/{vehicle_id}", response_model=VehicleRead)
async def update_vehicle(
    vehicle_id: uuid.UUID,
    payload: VehicleUpdate,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not await user_can_access_vehicle(session, user=actor, vehicle=vehicle):
        raise HTTPException(status_code=403, detail="You cannot update this vehicle")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return await build_vehicle_read(session, vehicle)

    if "registered_owner_name" in changes:
        registered_owner_name = (changes["registered_owner_name"] or "").strip()
        if not registered_owner_name:
            raise HTTPException(status_code=422, detail="Registered owner name cannot be blank")
        changes["registered_owner_name"] = registered_owner_name

    if changes.get("registration_number"):
        changes["registration_number"] = normalize_bangladesh_registration(
            changes["registration_number"]
        )
    for field in ("chassis_number", "engine_number"):
        if changes.get(field):
            changes[field] = normalize_vehicle_serial(changes[field])

    conflict = await find_identity_conflict(
        session,
        registration_number=changes.get("registration_number"),
        chassis_number=changes.get("chassis_number"),
        engine_number=changes.get("engine_number"),
        exclude_vehicle_id=vehicle.id,
    )
    if conflict is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "vehicle_identity_conflict",
                "message": "Vehicle identity conflicts with another global vehicle",
                "vehicle_id": str(conflict.id),
            },
        )

    changed_fields = [
        field for field, value in changes.items() if getattr(vehicle, field) != value
    ]
    for field, value in changes.items():
        setattr(vehicle, field, value)

    requires_reverification = bool(SENSITIVE_VEHICLE_FIELDS.intersection(changed_fields))
    if requires_reverification and not can_manage_all_vehicles(actor):
        vehicle.verification_status = VehicleVerificationStatus.PENDING_VERIFICATION
        vehicle.reviewed_by_user_id = None
        vehicle.reviewed_at = None
        vehicle.review_notes = None

    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise HTTPException(status_code=409, detail="Vehicle owner is missing")
    try:
        await write_audit_log(
            session,
            tenant_id=owner.tenant_id,
            actor_user_id=actor.id,
            action="vehicle.updated",
            resource_type="vehicle",
            resource_public_id=vehicle.id,
            new_values={
                "changed_fields": changed_fields,
                "reverification_required": requires_reverification,
                "verification_status": vehicle.verification_status.value,
            },
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "code": "vehicle_identity_exists",
                "message": "Registration, chassis, or engine identity already exists",
            },
        ) from exc
    await session.refresh(vehicle)
    return await build_vehicle_read(session, vehicle)


@router.post("/{vehicle_id}/review", response_model=VehicleRead)
async def review_vehicle(
    vehicle_id: uuid.UUID,
    payload: VehicleReview,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise HTTPException(status_code=409, detail="Vehicle owner is missing")

    vehicle.reviewed_by_user_id = actor.id
    vehicle.reviewed_at = datetime.now(UTC)
    vehicle.review_notes = payload.notes
    driver_activation_status: str | None = None
    if payload.decision == VehicleReviewDecision.APPROVE:
        vehicle.verification_status = VehicleVerificationStatus.VERIFIED
        pending_driver = await activate_pending_driver_assignment(
            session,
            vehicle=vehicle,
        )
        driver_activation_status = (
            pending_driver.status.value if pending_driver is not None else None
        )
    elif payload.decision == VehicleReviewDecision.REQUEST_CHANGES:
        vehicle.verification_status = VehicleVerificationStatus.CHANGES_REQUESTED
    else:
        vehicle.verification_status = VehicleVerificationStatus.REJECTED
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
            "driver_assignment_status": driver_activation_status,
        },
    )
    await session.commit()
    await session.refresh(vehicle)
    return await build_vehicle_read(session, vehicle)
