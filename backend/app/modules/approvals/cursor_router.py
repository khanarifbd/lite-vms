import base64
import json
import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    OwnerVerificationStatus,
    ProviderStatus,
    UserRole,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.drivers.enums import (
    DriverProfileChangeStatus,
    DriverVerificationStatus,
)
from app.modules.drivers.model import Driver, DriverLicence
from app.modules.drivers.service import build_driver_read
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import build_owner_read
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import build_provider_read
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.service import build_vehicle_read

router = APIRouter(
    prefix="/admin/approvals",
    tags=["Super admin national approval queue"],
)
ApprovalReviewer = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
]
Session = Annotated[AsyncSession, Depends(get_session)]
ApprovalEntity = Literal["provider", "owner", "vehicle", "driver"]
ApprovalStatus = Literal["all", "pending", "under_review"]
ApprovalSort = Literal["oldest", "newest"]
CursorDirection = Literal["next", "previous"]


class ApprovalEntitySummary(BaseModel):
    pending: int
    under_review: int
    total: int


class ApprovalQueueSummary(BaseModel):
    providers: ApprovalEntitySummary
    owners: ApprovalEntitySummary
    vehicles: ApprovalEntitySummary
    drivers: ApprovalEntitySummary
    total: int


class ApprovalQueueCursorPage(BaseModel):
    entity: ApprovalEntity
    items: list[dict[str, Any]]
    next_cursor: str | None
    previous_cursor: str | None
    has_next: bool
    has_previous: bool
    limit: int


def _normalized_search(search: str | None) -> str | None:
    if not search:
        return None
    value = search.strip().lower()
    return value or None


def _encode_cursor(
    *,
    entity: ApprovalEntity,
    status: ApprovalStatus,
    sort: ApprovalSort,
    search: str | None,
    created_at: datetime,
    item_id: uuid.UUID,
) -> str:
    payload = json.dumps(
        {
            "entity": entity,
            "status": status,
            "sort": sort,
            "search": search,
            "created_at": created_at.isoformat(),
            "id": str(item_id),
        },
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _decode_cursor(
    cursor: str,
    *,
    entity: ApprovalEntity,
    status: ApprovalStatus,
    sort: ApprovalSort,
    search: str | None,
) -> tuple[datetime, uuid.UUID]:
    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode((cursor + padding).encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
        if (
            payload["entity"] != entity
            or payload["status"] != status
            or payload["sort"] != sort
            or payload.get("search") != search
        ):
            raise ValueError("Cursor query does not match")
        created_at = datetime.fromisoformat(payload["created_at"])
        item_id = uuid.UUID(payload["id"])
    except (
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
        UnicodeDecodeError,
    ) as error:
        raise HTTPException(status_code=400, detail="Invalid approval queue cursor") from error
    return created_at, item_id


def _status_condition(entity: ApprovalEntity, status: ApprovalStatus):
    if entity == "driver":
        initial_pending = Driver.verification_status == DriverVerificationStatus.PENDING
        profile_pending = (
            Driver.profile_change_status == DriverProfileChangeStatus.PENDING
        )
        under_review = (
            Driver.verification_status == DriverVerificationStatus.UNDER_REVIEW
        )
        if status == "pending":
            return or_(initial_pending, profile_pending)
        if status == "under_review":
            return under_review
        return or_(initial_pending, under_review, profile_pending)

    if entity == "provider":
        pending = ProviderStatus.PENDING
        under_review = ProviderStatus.UNDER_REVIEW
        column = VTSProvider.status
    elif entity == "owner":
        pending = OwnerVerificationStatus.PENDING
        under_review = OwnerVerificationStatus.UNDER_REVIEW
        column = VehicleOwner.verification_status
    else:
        pending = VehicleVerificationStatus.PENDING_VERIFICATION
        under_review = VehicleVerificationStatus.UNDER_REVIEW
        column = Vehicle.verification_status

    if status == "pending":
        return column == pending
    if status == "under_review":
        return column == under_review
    return column.in_([pending, under_review])


def _provider_query(search: str | None):
    query = select(VTSProvider).where(_status_condition("provider", "all"))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                func.lower(VTSProvider.name).like(pattern),
                func.lower(VTSProvider.trade_name).like(pattern),
                func.lower(VTSProvider.application_number).like(pattern),
                func.lower(VTSProvider.code).like(pattern),
                func.lower(VTSProvider.license_number).like(pattern),
                func.lower(VTSProvider.trade_license_number).like(pattern),
                func.lower(VTSProvider.email).like(pattern),
                func.lower(VTSProvider.phone).like(pattern),
                func.lower(VTSProvider.district).like(pattern),
            )
        )
    return query


def _owner_query(search: str | None):
    query = select(VehicleOwner).where(_status_condition("owner", "all"))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                func.lower(VehicleOwner.name).like(pattern),
                func.lower(VehicleOwner.application_number).like(pattern),
                func.lower(VehicleOwner.owner_code).like(pattern),
                func.lower(VehicleOwner.nid_or_registration).like(pattern),
                func.lower(VehicleOwner.email).like(pattern),
                func.lower(VehicleOwner.phone).like(pattern),
                func.lower(VehicleOwner.district).like(pattern),
            )
        )
    return query


def _vehicle_query(search: str | None):
    query = select(Vehicle).where(_status_condition("vehicle", "all"))
    if search:
        pattern = f"%{search}%"
        query = (
            query.join(VehicleOwner, VehicleOwner.id == Vehicle.owner_id)
            .outerjoin(VTSProvider, VTSProvider.id == Vehicle.created_by_provider_id)
            .where(
                or_(
                    func.lower(Vehicle.registration_number).like(pattern),
                    func.lower(Vehicle.registration_number_display).like(pattern),
                    func.lower(Vehicle.chassis_number).like(pattern),
                    func.lower(Vehicle.engine_number).like(pattern),
                    func.lower(Vehicle.brand).like(pattern),
                    func.lower(Vehicle.model).like(pattern),
                    func.lower(Vehicle.vehicle_type).like(pattern),
                    func.lower(VehicleOwner.name).like(pattern),
                    func.lower(VehicleOwner.owner_code).like(pattern),
                    func.lower(VTSProvider.name).like(pattern),
                )
            )
        )
    return query


def _driver_query(search: str | None):
    query = select(Driver).where(
        _status_condition("driver", "all"),
        Driver.declaration_accepted.is_(True),
    )
    if search:
        pattern = f"%{search}%"
        query = query.join(DriverLicence, DriverLicence.driver_id == Driver.id).where(
            or_(
                func.lower(Driver.full_name).like(pattern),
                func.lower(Driver.driver_code).like(pattern),
                func.lower(Driver.nid_reference).like(pattern),
                func.lower(Driver.phone).like(pattern),
                func.lower(Driver.email).like(pattern),
                func.lower(Driver.district).like(pattern),
                func.lower(DriverLicence.licence_number).like(pattern),
            )
        )
    return query


def _base_query(entity: ApprovalEntity, search: str | None):
    if entity == "provider":
        return _provider_query(search), VTSProvider
    if entity == "owner":
        return _owner_query(search), VehicleOwner
    if entity == "vehicle":
        return _vehicle_query(search), Vehicle
    return _driver_query(search), Driver


def _cursor_condition(model, created_at: datetime, item_id: uuid.UUID, *, greater: bool):
    if greater:
        return or_(
            model.created_at > created_at,
            and_(model.created_at == created_at, model.id > item_id),
        )
    return or_(
        model.created_at < created_at,
        and_(model.created_at == created_at, model.id < item_id),
    )


async def _serialize_items(
    session: AsyncSession,
    entity: ApprovalEntity,
    rows: list[Any],
) -> list[dict[str, Any]]:
    if entity == "provider":
        reads = [await build_provider_read(session, item) for item in rows]
    elif entity == "owner":
        reads = [await build_owner_read(session, item) for item in rows]
    elif entity == "vehicle":
        reads = [await build_vehicle_read(session, item) for item in rows]
    else:
        reads = [await build_driver_read(session, item) for item in rows]
        serialized = []
        for driver, item in zip(rows, reads, strict=True):
            payload = item.model_dump(mode="json")
            payload["pending_profile_changes"] = driver.pending_profile_changes
            serialized.append(payload)
        return serialized
    return [item.model_dump(mode="json") for item in reads]


@router.get("/summary", response_model=ApprovalQueueSummary)
async def approval_queue_summary(
    _: ApprovalReviewer,
    session: Session,
) -> ApprovalQueueSummary:
    counts = (
        await session.execute(
            select(
                select(func.count(VTSProvider.id))
                .where(VTSProvider.status == ProviderStatus.PENDING)
                .scalar_subquery()
                .label("providers_pending"),
                select(func.count(VTSProvider.id))
                .where(VTSProvider.status == ProviderStatus.UNDER_REVIEW)
                .scalar_subquery()
                .label("providers_under_review"),
                select(func.count(VehicleOwner.id))
                .where(
                    VehicleOwner.verification_status == OwnerVerificationStatus.PENDING
                )
                .scalar_subquery()
                .label("owners_pending"),
                select(func.count(VehicleOwner.id))
                .where(
                    VehicleOwner.verification_status
                    == OwnerVerificationStatus.UNDER_REVIEW
                )
                .scalar_subquery()
                .label("owners_under_review"),
                select(func.count(Vehicle.id))
                .where(
                    Vehicle.verification_status
                    == VehicleVerificationStatus.PENDING_VERIFICATION
                )
                .scalar_subquery()
                .label("vehicles_pending"),
                select(func.count(Vehicle.id))
                .where(
                    Vehicle.verification_status == VehicleVerificationStatus.UNDER_REVIEW
                )
                .scalar_subquery()
                .label("vehicles_under_review"),
                select(func.count(Driver.id))
                .where(
                    or_(
                        Driver.verification_status == DriverVerificationStatus.PENDING,
                        Driver.profile_change_status == DriverProfileChangeStatus.PENDING,
                    ),
                    Driver.declaration_accepted.is_(True),
                )
                .scalar_subquery()
                .label("drivers_pending"),
                select(func.count(Driver.id))
                .where(
                    Driver.verification_status == DriverVerificationStatus.UNDER_REVIEW,
                    Driver.declaration_accepted.is_(True),
                )
                .scalar_subquery()
                .label("drivers_under_review"),
            )
        )
    ).one()

    providers = ApprovalEntitySummary(
        pending=int(counts.providers_pending or 0),
        under_review=int(counts.providers_under_review or 0),
        total=int(counts.providers_pending or 0)
        + int(counts.providers_under_review or 0),
    )
    owners = ApprovalEntitySummary(
        pending=int(counts.owners_pending or 0),
        under_review=int(counts.owners_under_review or 0),
        total=int(counts.owners_pending or 0) + int(counts.owners_under_review or 0),
    )
    vehicles = ApprovalEntitySummary(
        pending=int(counts.vehicles_pending or 0),
        under_review=int(counts.vehicles_under_review or 0),
        total=int(counts.vehicles_pending or 0)
        + int(counts.vehicles_under_review or 0),
    )
    drivers = ApprovalEntitySummary(
        pending=int(counts.drivers_pending or 0),
        under_review=int(counts.drivers_under_review or 0),
        total=int(counts.drivers_pending or 0) + int(counts.drivers_under_review or 0),
    )
    return ApprovalQueueSummary(
        providers=providers,
        owners=owners,
        vehicles=vehicles,
        drivers=drivers,
        total=providers.total + owners.total + vehicles.total + drivers.total,
    )


@router.get("/queue", response_model=ApprovalQueueCursorPage)
async def approval_queue_page(
    _: ApprovalReviewer,
    session: Session,
    entity: ApprovalEntity = "provider",
    status: ApprovalStatus = "all",
    sort: ApprovalSort = "oldest",
    search: str | None = Query(default=None, max_length=180),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, min_length=1, max_length=1000),
    direction: CursorDirection = "next",
) -> ApprovalQueueCursorPage:
    normalized_search = _normalized_search(search)
    query, model = _base_query(entity, normalized_search)
    query = query.where(_status_condition(entity, status))

    cursor_values = (
        _decode_cursor(
            cursor,
            entity=entity,
            status=status,
            sort=sort,
            search=normalized_search,
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
            _cursor_condition(model, cursor_created_at, cursor_id, greater=greater)
        )

    query_ascending = natural_ascending if direction == "next" else not natural_ascending
    if query_ascending:
        query = query.order_by(asc(model.created_at), asc(model.id))
    else:
        query = query.order_by(desc(model.created_at), desc(model.id))

    rows = list(await session.scalars(query.limit(limit + 1)))
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

    def cursor_for(item) -> str:
        return _encode_cursor(
            entity=entity,
            status=status,
            sort=sort,
            search=normalized_search,
            created_at=item.created_at,
            item_id=item.id,
        )

    return ApprovalQueueCursorPage(
        entity=entity,
        items=await _serialize_items(session, entity, rows),
        next_cursor=cursor_for(rows[-1]) if rows and has_next else None,
        previous_cursor=cursor_for(rows[0]) if rows and has_previous else None,
        has_next=has_next,
        has_previous=has_previous,
        limit=limit,
    )
