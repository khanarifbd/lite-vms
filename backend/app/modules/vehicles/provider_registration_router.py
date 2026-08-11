import secrets
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    OwnerVerificationStatus,
    ProviderStatus,
    UserRole,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.owners.model import VehicleOwner
from app.modules.providers.service import get_provider_for_user
from app.modules.qr_verification.model import VehicleQRToken
from app.modules.settings.service import auto_approve_vehicle
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.normalization import (
    normalize_bangladesh_registration,
    normalize_vehicle_serial,
)
from app.modules.vehicles.provider_registration_schema import (
    ProviderVehicleRegistrationCreate,
    ProviderVehicleRegistrationUpdate,
    VehicleIdentityAvailability,
)
from app.modules.vehicles.router import find_identity_conflict, resolve_vehicle_owner
from app.modules.vehicles.schema import VehicleRead
from app.modules.vehicles.service import build_vehicle_read, user_can_access_vehicle

router = APIRouter(
    prefix="/vehicles/provider-registration",
    tags=["VTS Provider Vehicle Registration"],
)

PROVIDER_VEHICLE_READ_ROLES = (
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VTS_TECHNICAL,
    UserRole.VTS_VIEWER,
)
PROVIDER_VEHICLE_MANAGE_ROLES = (UserRole.VTS_ADMIN, UserRole.VTS_OPERATOR)
PROVIDER_VEHICLE_EDITABLE_STATUSES = {
    VehicleVerificationStatus.DRAFT,
    VehicleVerificationStatus.CHANGES_REQUESTED,
}


async def require_approved_provider(session: AsyncSession, actor: User):
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider registration not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Approved VTS provider required")
    return provider


async def get_provider_vehicle(
    session: AsyncSession,
    *,
    actor: User,
    vehicle_id: uuid.UUID,
):
    provider = await require_approved_provider(session, actor)
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not await user_can_access_vehicle(session, user=actor, vehicle=vehicle):
        raise HTTPException(
            status_code=403,
            detail="An active owner-provider link is required to access this vehicle",
        )
    return vehicle, provider


def normalized_registration(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    try:
        return normalize_bangladesh_registration(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def normalized_serial(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    try:
        return normalize_vehicle_serial(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/identity-check", response_model=VehicleIdentityAvailability)
async def check_vehicle_identity(
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    registration_number: Annotated[str | None, Query(max_length=80)] = None,
    chassis_number: Annotated[str | None, Query(max_length=120)] = None,
    engine_number: Annotated[str | None, Query(max_length=120)] = None,
    exclude_vehicle_id: uuid.UUID | None = None,
) -> VehicleIdentityAvailability:
    await require_approved_provider(session, actor)
    if exclude_vehicle_id is not None:
        await get_provider_vehicle(
            session,
            actor=actor,
            vehicle_id=exclude_vehicle_id,
        )

    registration = normalized_registration(registration_number)
    chassis = normalized_serial(chassis_number)
    engine = normalized_serial(engine_number)
    if not any((registration, chassis, engine)):
        raise HTTPException(status_code=422, detail="Provide at least one vehicle identity")

    registration_query = select(Vehicle.id).where(
        Vehicle.registration_number == registration
    )
    chassis_query = select(Vehicle.id).where(Vehicle.chassis_number == chassis)
    engine_query = select(Vehicle.id).where(Vehicle.engine_number == engine)
    if exclude_vehicle_id is not None:
        registration_query = registration_query.where(Vehicle.id != exclude_vehicle_id)
        chassis_query = chassis_query.where(Vehicle.id != exclude_vehicle_id)
        engine_query = engine_query.where(Vehicle.id != exclude_vehicle_id)

    registration_exists = bool(
        registration and await session.scalar(registration_query)
    )
    chassis_exists = bool(chassis and await session.scalar(chassis_query))
    engine_exists = bool(engine and await session.scalar(engine_query))
    return VehicleIdentityAvailability(
        available=not any((registration_exists, chassis_exists, engine_exists)),
        registration_number_available=not registration_exists,
        chassis_number_available=not chassis_exists,
        engine_number_available=not engine_exists,
    )


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
async def register_provider_vehicle(
    payload: ProviderVehicleRegistrationCreate,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    owner, provider = await resolve_vehicle_owner(
        session,
        actor=actor,
        owner_id=payload.owner_id,
    )
    if provider is None:
        provider = await require_approved_provider(session, actor)
    if owner.verification_status != OwnerVerificationStatus.APPROVED:
        raise HTTPException(
            status_code=403,
            detail="Vehicle owner must be approved before registering vehicles",
        )

    registration_number = normalized_registration(payload.registration_number)
    chassis_number = normalized_serial(payload.chassis_number)
    engine_number = normalized_serial(payload.engine_number)
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
                "message": "Registration, chassis, or engine identity already exists",
            },
        )

    values = payload.model_dump(
        exclude={
            "owner_id",
            "registration_number",
            "registration_number_display",
            "chassis_number",
            "engine_number",
            "submit_for_review",
        }
    )
    verification_status = (
        VehicleVerificationStatus.PENDING_VERIFICATION
        if payload.submit_for_review
        else VehicleVerificationStatus.DRAFT
    )
    vehicle = Vehicle(
        **values,
        registration_number=registration_number,
        registration_number_display=(
            payload.registration_number_display or payload.registration_number.strip()
        ),
        chassis_number=chassis_number,
        engine_number=engine_number,
        owner_id=owner.id,
        created_by_provider_id=provider.id,
        submitted_by_user_id=actor.id if payload.submit_for_review else None,
        verification_status=verification_status,
    )
    session.add(vehicle)

    try:
        await session.flush()
        if payload.submit_for_review:
            session.add(
                VehicleQRToken(
                    vehicle_id=vehicle.id,
                    token=secrets.token_urlsafe(32),
                )
            )
            await auto_approve_vehicle(session, vehicle)
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=provider.root_organization_id,
            action=(
                "vehicle.registration_submitted"
                if payload.submit_for_review
                else "vehicle.registration_draft_saved"
            ),
            resource_type="vehicle",
            resource_public_id=vehicle.id,
            new_values={
                "registration_number": vehicle.registration_number,
                "owner_id": str(owner.id),
                "created_by_provider_id": str(provider.id),
                "verification_status": vehicle.verification_status.value,
                "auto_approved": (
                    vehicle.verification_status == VehicleVerificationStatus.VERIFIED
                ),
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


@router.get("/{vehicle_id}", response_model=VehicleRead)
async def read_provider_vehicle(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle, _ = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    return await build_vehicle_read(session, vehicle)


@router.patch("/{vehicle_id}", response_model=VehicleRead)
async def update_provider_vehicle(
    vehicle_id: uuid.UUID,
    payload: ProviderVehicleRegistrationUpdate,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle, provider = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    if vehicle.verification_status not in PROVIDER_VEHICLE_EDITABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=(
                "Only draft vehicles or registrations with requested changes can be edited"
            ),
        )

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="At least one vehicle field is required")
    for required_field in ("registration_number", "chassis_number", "vehicle_type"):
        if required_field in changes and changes[required_field] is None:
            raise HTTPException(
                status_code=422,
                detail=f"{required_field.replace('_', ' ').title()} cannot be cleared",
            )

    if "registration_number" in changes:
        changes["registration_number"] = normalized_registration(
            changes["registration_number"]
        )
    if "chassis_number" in changes:
        changes["chassis_number"] = normalized_serial(changes["chassis_number"])
    if "engine_number" in changes:
        changes["engine_number"] = normalized_serial(changes["engine_number"])

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
    if not changed_fields:
        return await build_vehicle_read(session, vehicle)

    previous_status = vehicle.verification_status
    for field, value in changes.items():
        setattr(vehicle, field, value)

    action = (
        "vehicle.registration_correction_saved"
        if previous_status == VehicleVerificationStatus.CHANGES_REQUESTED
        else "vehicle.registration_draft_updated"
    )
    try:
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=provider.root_organization_id,
            action=action,
            resource_type="vehicle",
            resource_public_id=vehicle.id,
            new_values={
                "changed_fields": changed_fields,
                "verification_status": previous_status.value,
                "review_notes_retained": bool(vehicle.review_notes),
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


@router.post("/{vehicle_id}/submit", response_model=VehicleRead)
async def submit_provider_vehicle(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle, provider = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    if vehicle.verification_status not in PROVIDER_VEHICLE_EDITABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="Only draft or changes-requested vehicles can be submitted",
        )

    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise HTTPException(status_code=409, detail="Vehicle owner is missing")
    if owner.verification_status != OwnerVerificationStatus.APPROVED:
        raise HTTPException(
            status_code=403,
            detail="Vehicle owner must remain approved before submission",
        )

    previous_status = vehicle.verification_status
    previous_review_notes = vehicle.review_notes
    vehicle.verification_status = VehicleVerificationStatus.PENDING_VERIFICATION
    vehicle.submitted_by_user_id = actor.id
    vehicle.reviewed_by_user_id = None
    vehicle.reviewed_at = None
    vehicle.review_notes = None

    existing_qr = await session.scalar(
        select(VehicleQRToken.id).where(VehicleQRToken.vehicle_id == vehicle.id)
    )
    if existing_qr is None:
        session.add(
            VehicleQRToken(
                vehicle_id=vehicle.id,
                token=secrets.token_urlsafe(32),
            )
        )

    await auto_approve_vehicle(session, vehicle)
    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=provider.root_organization_id,
        action=(
            "vehicle.registration_resubmitted"
            if previous_status == VehicleVerificationStatus.CHANGES_REQUESTED
            else "vehicle.registration_submitted"
        ),
        resource_type="vehicle",
        resource_public_id=vehicle.id,
        new_values={
            "owner_id": str(owner.id),
            "created_by_provider_id": str(provider.id),
            "previous_verification_status": previous_status.value,
            "previous_review_notes": previous_review_notes,
            "verification_status": vehicle.verification_status.value,
            "auto_approved": (
                vehicle.verification_status == VehicleVerificationStatus.VERIFIED
            ),
        },
    )
    await session.commit()
    await session.refresh(vehicle)
    return await build_vehicle_read(session, vehicle)
