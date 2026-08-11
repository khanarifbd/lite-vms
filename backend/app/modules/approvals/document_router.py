import base64
import json
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import DocumentStatus, DocumentType, UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.documents.model import VehicleDocument
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.vehicles.document_management_service import sync_vehicle_document_fields
from app.modules.vehicles.model import Vehicle

router = APIRouter(
    prefix="/admin/vehicle-documents",
    tags=["Admin vehicle document approvals"],
)

DocumentQueueStatus = Literal["all", "pending", "expired", "expiring_soon"]
DocumentQueueSort = Literal["oldest", "newest"]
CursorDirection = Literal["next", "previous"]
DocumentReviewDecision = Literal["approve", "reject", "request_changes"]
Reviewer = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
]
Session = Annotated[AsyncSession, Depends(get_session)]


class DocumentApprovalSummary(BaseModel):
    pending: int
    expired: int
    expiring_soon: int
    total: int


class DocumentOwnerSummary(BaseModel):
    id: uuid.UUID
    owner_code: str | None
    owner_name: str
    phone: str | None


class DocumentProviderSummary(BaseModel):
    id: uuid.UUID | None
    code: str | None
    name: str | None


class DocumentApprovalItem(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    registration_number: str
    registration_number_display: str | None
    vehicle_verification_status: str
    owner: DocumentOwnerSummary
    provider: DocumentProviderSummary
    document_type: str
    document_number: str | None
    issued_at: date | None
    expires_at: date | None
    expiry_status: str
    status: str
    source: str
    storage_key: str | None
    file_name: str | None
    content_type: str | None
    size_bytes: int | None
    version: int
    is_active: bool
    review_notes: str | None
    review_required: bool
    created_at: datetime
    updated_at: datetime


class DocumentApprovalCursorPage(BaseModel):
    entity: Literal["document"] = "document"
    items: list[DocumentApprovalItem]
    next_cursor: str | None
    previous_cursor: str | None
    has_next: bool
    has_previous: bool
    limit: int


class DocumentReviewPayload(BaseModel):
    decision: DocumentReviewDecision
    notes: str = Field(min_length=3, max_length=2000)


def _normalized_search(search: str | None) -> str | None:
    if not search:
        return None
    value = search.strip().lower()
    return value or None


def _expiry_status(expires_at: date | None) -> str:
    if expires_at is None:
        return "not_applicable"
    today = date.today()
    if expires_at < today:
        return "expired"
    if expires_at <= today + timedelta(days=30):
        return "expiring_soon"
    return "valid"


def _approved_active_condition():
    return and_(
        VehicleDocument.is_active.is_(True),
        VehicleDocument.status.notin_(
            [
                DocumentStatus.PENDING_VERIFICATION,
                DocumentStatus.REVOKED,
            ]
        ),
    )


def _expired_condition():
    return and_(
        _approved_active_condition(),
        VehicleDocument.expires_at < date.today(),
    )


def _expiring_soon_condition():
    today = date.today()
    return and_(
        _approved_active_condition(),
        VehicleDocument.expires_at >= today,
        VehicleDocument.expires_at <= today + timedelta(days=30),
    )


def _queue_condition(status: DocumentQueueStatus):
    pending = VehicleDocument.status == DocumentStatus.PENDING_VERIFICATION
    if status == "pending":
        return pending
    if status == "expired":
        return _expired_condition()
    if status == "expiring_soon":
        return _expiring_soon_condition()
    return or_(pending, _expired_condition(), _expiring_soon_condition())


def _encode_cursor(
    *,
    status: DocumentQueueStatus,
    sort: DocumentQueueSort,
    search: str | None,
    document_type: DocumentType | None,
    created_at: datetime,
    item_id: uuid.UUID,
) -> str:
    payload = json.dumps(
        {
            "status": status,
            "sort": sort,
            "search": search,
            "document_type": document_type.value if document_type else None,
            "created_at": created_at.isoformat(),
            "id": str(item_id),
        },
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _decode_cursor(
    cursor: str,
    *,
    status: DocumentQueueStatus,
    sort: DocumentQueueSort,
    search: str | None,
    document_type: DocumentType | None,
) -> tuple[datetime, uuid.UUID]:
    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode((cursor + padding).encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
        if (
            payload["status"] != status
            or payload["sort"] != sort
            or payload.get("search") != search
            or payload.get("document_type")
            != (document_type.value if document_type else None)
        ):
            raise ValueError("Cursor query does not match")
        return datetime.fromisoformat(payload["created_at"]), uuid.UUID(payload["id"])
    except (
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
        UnicodeDecodeError,
    ) as error:
        raise HTTPException(status_code=400, detail="Invalid document queue cursor") from error


def _cursor_condition(created_at: datetime, item_id: uuid.UUID, *, greater: bool):
    if greater:
        return or_(
            VehicleDocument.created_at > created_at,
            and_(
                VehicleDocument.created_at == created_at,
                VehicleDocument.id > item_id,
            ),
        )
    return or_(
        VehicleDocument.created_at < created_at,
        and_(
            VehicleDocument.created_at == created_at,
            VehicleDocument.id < item_id,
        ),
    )


def _document_item(
    document: VehicleDocument,
    vehicle: Vehicle,
    owner: VehicleOwner,
    provider: VTSProvider | None,
) -> DocumentApprovalItem:
    return DocumentApprovalItem(
        id=document.id,
        vehicle_id=vehicle.id,
        registration_number=vehicle.registration_number,
        registration_number_display=vehicle.registration_number_display,
        vehicle_verification_status=vehicle.verification_status.value,
        owner=DocumentOwnerSummary(
            id=owner.id,
            owner_code=owner.owner_code,
            owner_name=owner.name,
            phone=owner.phone,
        ),
        provider=DocumentProviderSummary(
            id=provider.id if provider else None,
            code=provider.code if provider else None,
            name=provider.name if provider else None,
        ),
        document_type=document.document_type.value,
        document_number=document.document_number,
        issued_at=document.issued_at,
        expires_at=document.expires_at,
        expiry_status=_expiry_status(document.expires_at),
        status=document.status.value,
        source=document.source,
        storage_key=document.storage_key,
        file_name=document.file_name,
        content_type=document.content_type,
        size_bytes=document.size_bytes,
        version=document.version,
        is_active=document.is_active,
        review_notes=document.review_notes,
        review_required=document.status == DocumentStatus.PENDING_VERIFICATION,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


@router.get("/summary", response_model=DocumentApprovalSummary)
async def document_approval_summary(
    _: Reviewer,
    session: Session,
) -> DocumentApprovalSummary:
    counts = (
        await session.execute(
            select(
                select(func.count(VehicleDocument.id))
                .where(VehicleDocument.status == DocumentStatus.PENDING_VERIFICATION)
                .scalar_subquery()
                .label("pending"),
                select(func.count(VehicleDocument.id))
                .where(_expired_condition())
                .scalar_subquery()
                .label("expired"),
                select(func.count(VehicleDocument.id))
                .where(_expiring_soon_condition())
                .scalar_subquery()
                .label("expiring_soon"),
                select(func.count(VehicleDocument.id))
                .where(_queue_condition("all"))
                .scalar_subquery()
                .label("total"),
            )
        )
    ).one()
    return DocumentApprovalSummary(
        pending=int(counts.pending or 0),
        expired=int(counts.expired or 0),
        expiring_soon=int(counts.expiring_soon or 0),
        total=int(counts.total or 0),
    )


@router.get("", response_model=DocumentApprovalCursorPage)
async def list_document_approvals(
    _: Reviewer,
    session: Session,
    status: DocumentQueueStatus = "pending",
    sort: DocumentQueueSort = "oldest",
    document_type: DocumentType | None = Query(default=None),
    search: str | None = Query(default=None, max_length=180),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, min_length=1, max_length=1000),
    direction: CursorDirection = "next",
) -> DocumentApprovalCursorPage:
    normalized_search = _normalized_search(search)
    query = (
        select(VehicleDocument, Vehicle, VehicleOwner, VTSProvider)
        .join(Vehicle, Vehicle.id == VehicleDocument.vehicle_id)
        .join(VehicleOwner, VehicleOwner.id == Vehicle.owner_id)
        .outerjoin(VTSProvider, VTSProvider.id == Vehicle.created_by_provider_id)
        .where(_queue_condition(status))
    )
    if document_type is not None:
        query = query.where(VehicleDocument.document_type == document_type)
    if normalized_search:
        pattern = f"%{normalized_search}%"
        query = query.where(
            or_(
                func.lower(Vehicle.registration_number).like(pattern),
                func.lower(Vehicle.registration_number_display).like(pattern),
                func.lower(VehicleOwner.name).like(pattern),
                func.lower(VehicleOwner.owner_code).like(pattern),
                func.lower(VTSProvider.name).like(pattern),
                func.lower(VTSProvider.code).like(pattern),
                func.lower(VehicleDocument.document_number).like(pattern),
                func.lower(VehicleDocument.file_name).like(pattern),
                func.lower(VehicleDocument.source).like(pattern),
            )
        )

    cursor_values = (
        _decode_cursor(
            cursor,
            status=status,
            sort=sort,
            search=normalized_search,
            document_type=document_type,
        )
        if cursor
        else None
    )
    natural_ascending = sort == "oldest"
    if cursor_values is not None:
        cursor_created_at, cursor_id = cursor_values
        moving_forward = direction == "next"
        greater = natural_ascending if moving_forward else not natural_ascending
        query = query.where(
            _cursor_condition(cursor_created_at, cursor_id, greater=greater)
        )

    query_ascending = natural_ascending if direction == "next" else not natural_ascending
    if query_ascending:
        query = query.order_by(
            asc(VehicleDocument.created_at),
            asc(VehicleDocument.id),
        )
    else:
        query = query.order_by(
            desc(VehicleDocument.created_at),
            desc(VehicleDocument.id),
        )

    rows = list((await session.execute(query.limit(limit + 1))).all())
    has_extra = len(rows) > limit
    rows = rows[:limit]
    if direction == "previous":
        rows.reverse()

    if direction == "previous":
        has_previous = has_extra
        has_next = cursor is not None
    else:
        has_previous = cursor is not None
        has_next = has_extra

    items = [
        _document_item(document, vehicle, owner, provider)
        for document, vehicle, owner, provider in rows
    ]

    def cursor_for(item: DocumentApprovalItem) -> str:
        return _encode_cursor(
            status=status,
            sort=sort,
            search=normalized_search,
            document_type=document_type,
            created_at=item.created_at,
            item_id=item.id,
        )

    return DocumentApprovalCursorPage(
        items=items,
        next_cursor=cursor_for(items[-1]) if items and has_next else None,
        previous_cursor=cursor_for(items[0]) if items and has_previous else None,
        has_next=has_next,
        has_previous=has_previous,
        limit=limit,
    )


@router.post("/{document_id}/review", response_model=DocumentApprovalItem)
async def review_vehicle_document(
    document_id: uuid.UUID,
    payload: DocumentReviewPayload,
    actor: Reviewer,
    session: Session,
) -> DocumentApprovalItem:
    document = await session.get(VehicleDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Vehicle document not found")
    if document.status != DocumentStatus.PENDING_VERIFICATION:
        raise HTTPException(status_code=409, detail="This document is not awaiting review")

    vehicle = await session.get(Vehicle, document.vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=409, detail="Document vehicle is missing")
    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise HTTPException(status_code=409, detail="Vehicle owner is missing")
    provider = (
        await session.get(VTSProvider, vehicle.created_by_provider_id)
        if vehicle.created_by_provider_id
        else None
    )
    predecessor = await session.scalar(
        select(VehicleDocument)
        .where(VehicleDocument.replaced_by_id == document.id)
        .order_by(VehicleDocument.version.desc())
    )

    now = datetime.now(UTC)
    if payload.decision == "approve":
        if predecessor is not None:
            predecessor.is_active = False
        document.is_active = True
        document.status = DocumentStatus.VALID
        document.verified_by_user_id = actor.id
        document.verified_at = now
        document.review_notes = payload.notes
        sync_vehicle_document_fields(
            vehicle,
            document_type=document.document_type,
            storage_key=document.storage_key,
            document_number=document.document_number,
            expires_at=document.expires_at,
        )
    else:
        document.is_active = False
        document.status = DocumentStatus.REVOKED
        document.verified_by_user_id = actor.id
        document.verified_at = now
        document.review_notes = payload.notes

        # Pending uploads never change operational vehicle fields. Rejecting or
        # requesting changes must therefore preserve the existing approved document
        # and any legacy expiry date entered during vehicle registration.
        if predecessor is not None:
            predecessor.replaced_by_id = None
            if predecessor.status not in {
                DocumentStatus.PENDING_VERIFICATION,
                DocumentStatus.REVOKED,
            }:
                predecessor.is_active = True
                sync_vehicle_document_fields(
                    vehicle,
                    document_type=predecessor.document_type,
                    storage_key=predecessor.storage_key,
                    document_number=predecessor.document_number,
                    expires_at=predecessor.expires_at,
                )

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action=f"vehicle.document_{payload.decision}",
        resource_type="vehicle_document",
        resource_public_id=document.id,
        new_values={
            "vehicle_id": str(vehicle.id),
            "document_type": document.document_type.value,
            "version": document.version,
            "document_status": document.status.value,
            "vehicle_verification_status": vehicle.verification_status.value,
            "replaced_document_id": str(predecessor.id) if predecessor else None,
        },
        reason=payload.notes,
    )
    await session.commit()
    await session.refresh(document)
    await session.refresh(vehicle)
    return _document_item(document, vehicle, owner, provider)
