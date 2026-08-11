import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import DocumentStatus, UserRole
from app.core.database import get_session
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User
from app.modules.documents.model import VehicleDocument
from app.modules.documents.schema import VehicleDocumentCreate, VehicleDocumentRead
from app.modules.vehicles.document_management_service import sync_vehicle_document_fields
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.service import user_can_access_vehicle

router = APIRouter(prefix="/documents", tags=["Vehicle documents"])

DOCUMENT_CREATE_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.POLICE_ADMIN,
    UserRole.VEHICLE_OWNER,
)

NON_OPERATIONAL_STATUSES = (
    DocumentStatus.PENDING_VERIFICATION,
    DocumentStatus.REVOKED,
)
OPERATIONAL_STATUSES = (
    DocumentStatus.VALID,
    DocumentStatus.EXPIRED,
)


@router.post("", response_model=VehicleDocumentRead, status_code=status.HTTP_201_CREATED)
async def create_document(
    payload: VehicleDocumentCreate,
    actor: Annotated[User, Depends(require_roles(*DOCUMENT_CREATE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleDocument:
    vehicle = await session.get(Vehicle, payload.vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not await user_can_access_vehicle(session, user=actor, vehicle=vehicle):
        raise HTTPException(status_code=403, detail="You cannot manage this vehicle")

    roles = set(getattr(actor, "_role_codes", set()))
    can_verify = bool(
        roles.intersection(
            {
                UserRole.SUPER_ADMIN.value,
                UserRole.POLICE_ADMIN.value,
            }
        )
    )
    document_status = payload.status if can_verify else DocumentStatus.PENDING_VERIFICATION
    if document_status == DocumentStatus.REVOKED:
        raise HTTPException(
            status_code=422,
            detail="A revoked vehicle document cannot be created as a new version",
        )

    latest = await session.scalar(
        select(VehicleDocument)
        .where(
            VehicleDocument.vehicle_id == payload.vehicle_id,
            VehicleDocument.document_type == payload.document_type,
        )
        .order_by(VehicleDocument.version.desc())
    )
    current = await session.scalar(
        select(VehicleDocument)
        .where(
            VehicleDocument.vehicle_id == payload.vehicle_id,
            VehicleDocument.document_type == payload.document_type,
            VehicleDocument.is_active.is_(True),
            VehicleDocument.status.notin_(NON_OPERATIONAL_STATUSES),
        )
        .order_by(VehicleDocument.version.desc())
    )
    existing_pending = await session.scalar(
        select(VehicleDocument)
        .where(
            VehicleDocument.vehicle_id == payload.vehicle_id,
            VehicleDocument.document_type == payload.document_type,
            VehicleDocument.status == DocumentStatus.PENDING_VERIFICATION,
        )
        .order_by(VehicleDocument.version.desc())
    )

    # Recover an approved predecessor that may have been deactivated by the old
    # replacement workflow before staged replacements were introduced.
    if current is None and existing_pending is not None:
        predecessor = await session.scalar(
            select(VehicleDocument)
            .where(VehicleDocument.replaced_by_id == existing_pending.id)
            .order_by(VehicleDocument.version.desc())
        )
        if predecessor is not None and predecessor.status not in NON_OPERATIONAL_STATUSES:
            predecessor.is_active = True
            predecessor.replaced_by_id = None
            current = predecessor

    # Only one pending version per vehicle/document type is kept reviewable. A newer
    # upload supersedes the older pending version without touching the approved one.
    if existing_pending is not None:
        existing_pending.status = DocumentStatus.REVOKED
        existing_pending.is_active = False
        existing_pending.review_notes = "Superseded by a newer document upload."
        if current is not None and current.replaced_by_id == existing_pending.id:
            current.replaced_by_id = None

    is_operational = document_status in OPERATIONAL_STATUSES
    version = latest.version + 1 if latest else 1

    values = payload.model_dump()
    values["status"] = document_status
    document = VehicleDocument(
        **values,
        version=version,
        # A pending replacement remains staged while the approved predecessor stays
        # active. An initial pending document is active only because no predecessor exists.
        is_active=is_operational or current is None,
        verified_by_user_id=actor.id if is_operational else None,
        verified_at=datetime.now(UTC) if is_operational else None,
    )
    session.add(document)
    await session.flush()

    if current is not None:
        current.replaced_by_id = document.id
        if is_operational:
            current.is_active = False

    if is_operational:
        sync_vehicle_document_fields(
            vehicle,
            document_type=document.document_type,
            storage_key=document.storage_key,
            document_number=document.document_number,
            expires_at=document.expires_at,
        )

    await session.commit()
    await session.refresh(document)
    return document


@router.get("/vehicle/{vehicle_id}", response_model=list[VehicleDocumentRead])
async def list_vehicle_documents(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    include_history: bool = Query(default=False),
) -> list[VehicleDocument]:
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not await user_can_access_vehicle(session, user=actor, vehicle=vehicle):
        raise HTTPException(status_code=403, detail="You cannot access this vehicle")

    query = select(VehicleDocument).where(VehicleDocument.vehicle_id == vehicle_id)
    if not include_history:
        query = query.where(
            (VehicleDocument.is_active.is_(True))
            | (VehicleDocument.status == DocumentStatus.PENDING_VERIFICATION)
        )
    result = await session.scalars(
        query.order_by(VehicleDocument.document_type, VehicleDocument.version.desc())
    )
    return list(result)
