import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, asc, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole, ViolationStatus
from app.core.database import get_session
from app.modules.audit.model import AuditLog
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.enforcement.model import EnforcementCase
from app.modules.enforcement.schema import (
    CandidateDecision,
    EnforcementCaseRead,
    ViolationCandidateRead,
)
from app.modules.iam.model import Organization
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.telemetry.model import TelemetryPoint
from app.modules.tracking.model import TelemetrySource, TrackingDevice, VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle
from app.modules.violations.model import ViolationCandidate

router = APIRouter(
    prefix="/admin/enforcement/national",
    tags=["Super admin national enforcement review"],
)
SuperAdmin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]
Session = Annotated[AsyncSession, Depends(get_session)]


class ReviewVehicleSummary(BaseModel):
    id: uuid.UUID
    registration_number: str
    registration_number_display: str | None
    vehicle_type: str
    vehicle_category: str | None
    brand: str | None
    model: str | None
    manufacturing_year: int | None
    color: str | None
    verification_status: str
    movement_state: str | None
    latest_speed_kph: float | None
    last_received_at: datetime | None


class ReviewOwnerSummary(BaseModel):
    id: uuid.UUID
    owner_code: str | None
    name: str
    owner_type: str
    phone: str | None
    email: str | None
    district: str | None
    verification_status: str


class ReviewProviderSummary(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    trade_name: str | None
    phone: str | None
    email: str | None
    status: str
    integration_status: str | None
    last_telemetry_received_at: datetime | None


class ReviewDeviceSummary(BaseModel):
    id: uuid.UUID
    imei: str | None
    device_identifier: str
    manufacturer: str | None
    model: str | None
    protocol: str | None
    operational_status: str
    certification_status: str
    last_seen_at: datetime | None
    source_code: str | None


class ViolationCandidateReviewRead(ViolationCandidateRead):
    vehicle_profile: ReviewVehicleSummary | None = None
    owner_profile: ReviewOwnerSummary | None = None
    provider_profile: ReviewProviderSummary | None = None
    device_profile: ReviewDeviceSummary | None = None
    responsible_organization_name: str | None = None


class ViolationCandidateCursorPage(BaseModel):
    items: list[ViolationCandidateReviewRead]
    next_cursor: str | None
    previous_cursor: str | None
    has_next: bool
    has_previous: bool
    limit: int


def enum_value(value: object | None) -> str | None:
    if value is None:
        return None
    return str(getattr(value, "value", value))


def encode_candidate_cursor(candidate: ViolationCandidate) -> str:
    payload = json.dumps(
        {
            "detected_at": candidate.detected_at.isoformat(),
            "id": str(candidate.id),
        },
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_candidate_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode((cursor + padding).encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
        detected_at = datetime.fromisoformat(payload["detected_at"])
        candidate_id = uuid.UUID(payload["id"])
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=400, detail="Invalid review queue cursor") from error
    return detected_at, candidate_id


async def get_candidate_or_404(
    session: AsyncSession,
    candidate_id: uuid.UUID,
) -> ViolationCandidate:
    candidate = await session.get(ViolationCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Violation candidate not found")
    return candidate


async def build_review_items(
    session: AsyncSession,
    candidates: list[ViolationCandidate],
) -> list[ViolationCandidateReviewRead]:
    if not candidates:
        return []

    vehicle_ids = {item.vehicle_id for item in candidates}
    telemetry_ids = {item.telemetry_id for item in candidates}
    organization_ids = {
        item.review_organization_id
        for item in candidates
        if item.review_organization_id is not None
    }

    vehicles = list(
        await session.scalars(select(Vehicle).where(Vehicle.id.in_(vehicle_ids)))
    )
    telemetry_points = list(
        await session.scalars(
            select(TelemetryPoint).where(TelemetryPoint.id.in_(telemetry_ids))
        )
    )
    organizations = list(
        await session.scalars(
            select(Organization).where(Organization.id.in_(organization_ids))
        )
    ) if organization_ids else []

    vehicle_by_id = {item.id: item for item in vehicles}
    telemetry_by_id = {item.id: item for item in telemetry_points}
    organization_by_id = {item.id: item for item in organizations}

    owner_ids = {item.owner_id for item in vehicles}
    assignment_ids = {item.assignment_id for item in telemetry_points}
    device_ids = {item.device_id for item in telemetry_points}
    source_ids = {item.source_id for item in telemetry_points}

    owners = list(
        await session.scalars(select(VehicleOwner).where(VehicleOwner.id.in_(owner_ids)))
    ) if owner_ids else []
    assignments = list(
        await session.scalars(
            select(VehicleDeviceAssignment).where(
                VehicleDeviceAssignment.id.in_(assignment_ids)
            )
        )
    ) if assignment_ids else []
    devices = list(
        await session.scalars(
            select(TrackingDevice).where(TrackingDevice.id.in_(device_ids))
        )
    ) if device_ids else []
    sources = list(
        await session.scalars(
            select(TelemetrySource).where(TelemetrySource.id.in_(source_ids))
        )
    ) if source_ids else []

    owner_by_id = {item.id: item for item in owners}
    assignment_by_id = {item.id: item for item in assignments}
    device_by_id = {item.id: item for item in devices}
    source_by_id = {item.id: item for item in sources}

    provider_ids: set[uuid.UUID] = set()
    for vehicle in vehicles:
        if vehicle.created_by_provider_id is not None:
            provider_ids.add(vehicle.created_by_provider_id)
    for assignment in assignments:
        if assignment.provider_id is not None:
            provider_ids.add(assignment.provider_id)
    for source in sources:
        if source.provider_id is not None:
            provider_ids.add(source.provider_id)

    providers = list(
        await session.scalars(select(VTSProvider).where(VTSProvider.id.in_(provider_ids)))
    ) if provider_ids else []
    provider_by_id = {item.id: item for item in providers}

    result: list[ViolationCandidateReviewRead] = []
    for candidate in candidates:
        vehicle = vehicle_by_id.get(candidate.vehicle_id)
        telemetry = telemetry_by_id.get(candidate.telemetry_id)
        assignment = assignment_by_id.get(telemetry.assignment_id) if telemetry else None
        device = device_by_id.get(telemetry.device_id) if telemetry else None
        source = source_by_id.get(telemetry.source_id) if telemetry else None
        owner = owner_by_id.get(vehicle.owner_id) if vehicle else None

        provider_id = None
        if assignment and assignment.provider_id is not None:
            provider_id = assignment.provider_id
        elif source and source.provider_id is not None:
            provider_id = source.provider_id
        elif vehicle and vehicle.created_by_provider_id is not None:
            provider_id = vehicle.created_by_provider_id
        provider = provider_by_id.get(provider_id) if provider_id else None
        organization = organization_by_id.get(candidate.review_organization_id)

        candidate_data = ViolationCandidateRead.model_validate(candidate).model_dump()
        result.append(
            ViolationCandidateReviewRead(
                **candidate_data,
                vehicle_profile=(
                    ReviewVehicleSummary(
                        id=vehicle.id,
                        registration_number=vehicle.registration_number,
                        registration_number_display=vehicle.registration_number_display,
                        vehicle_type=vehicle.vehicle_type,
                        vehicle_category=vehicle.vehicle_category,
                        brand=vehicle.brand,
                        model=vehicle.model,
                        manufacturing_year=vehicle.manufacturing_year,
                        color=vehicle.color,
                        verification_status=enum_value(vehicle.verification_status) or "unknown",
                        movement_state=vehicle.movement_state,
                        latest_speed_kph=vehicle.latest_speed_kph,
                        last_received_at=vehicle.last_received_at,
                    )
                    if vehicle
                    else None
                ),
                owner_profile=(
                    ReviewOwnerSummary(
                        id=owner.id,
                        owner_code=owner.owner_code,
                        name=owner.name,
                        owner_type=enum_value(owner.owner_type) or "unknown",
                        phone=owner.phone,
                        email=owner.email,
                        district=owner.district,
                        verification_status=enum_value(owner.verification_status) or "unknown",
                    )
                    if owner
                    else None
                ),
                provider_profile=(
                    ReviewProviderSummary(
                        id=provider.id,
                        code=provider.code,
                        name=provider.name,
                        trade_name=provider.trade_name,
                        phone=provider.phone,
                        email=provider.email,
                        status=enum_value(provider.status) or "unknown",
                        integration_status=provider.integration_status,
                        last_telemetry_received_at=provider.last_telemetry_received_at,
                    )
                    if provider
                    else None
                ),
                device_profile=(
                    ReviewDeviceSummary(
                        id=device.id,
                        imei=device.imei,
                        device_identifier=device.device_identifier,
                        manufacturer=device.manufacturer,
                        model=device.model,
                        protocol=device.protocol,
                        operational_status=enum_value(device.operational_status) or "unknown",
                        certification_status=enum_value(device.certification_status) or "unknown",
                        last_seen_at=device.last_seen_at,
                        source_code=source.code if source else None,
                    )
                    if device
                    else None
                ),
                responsible_organization_name=(
                    organization.name_en if organization else None
                ),
            )
        )
    return result


@router.get("/review-queue", response_model=ViolationCandidateCursorPage)
async def national_review_queue(
    _: SuperAdmin,
    session: Session,
    status: ViolationStatus = ViolationStatus.PENDING_REVIEW,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, min_length=1, max_length=500),
    direction: Literal["next", "previous"] = "next",
) -> ViolationCandidateCursorPage:
    query = select(ViolationCandidate).where(ViolationCandidate.status == status)
    cursor_values = decode_candidate_cursor(cursor) if cursor else None

    if cursor_values is not None:
        cursor_detected_at, cursor_id = cursor_values
        if direction == "previous":
            query = query.where(
                or_(
                    ViolationCandidate.detected_at > cursor_detected_at,
                    and_(
                        ViolationCandidate.detected_at == cursor_detected_at,
                        ViolationCandidate.id > cursor_id,
                    ),
                )
            ).order_by(
                asc(ViolationCandidate.detected_at),
                asc(ViolationCandidate.id),
            )
        else:
            query = query.where(
                or_(
                    ViolationCandidate.detected_at < cursor_detected_at,
                    and_(
                        ViolationCandidate.detected_at == cursor_detected_at,
                        ViolationCandidate.id < cursor_id,
                    ),
                )
            ).order_by(
                desc(ViolationCandidate.detected_at),
                desc(ViolationCandidate.id),
            )
    else:
        query = query.order_by(
            desc(ViolationCandidate.detected_at),
            desc(ViolationCandidate.id),
        )

    rows = list(await session.scalars(query.limit(limit + 1)))
    has_extra = len(rows) > limit
    rows = rows[:limit]

    if direction == "previous":
        rows.reverse()

    if not rows:
        return ViolationCandidateCursorPage(
            items=[],
            next_cursor=cursor if cursor and direction == "previous" else None,
            previous_cursor=cursor if cursor and direction == "next" else None,
            has_next=bool(cursor and direction == "previous"),
            has_previous=bool(cursor and direction == "next"),
            limit=limit,
        )

    if direction == "previous":
        has_previous = has_extra
        has_next = cursor is not None
    else:
        has_previous = cursor is not None
        has_next = has_extra

    return ViolationCandidateCursorPage(
        items=await build_review_items(session, rows),
        next_cursor=encode_candidate_cursor(rows[-1]) if has_next else None,
        previous_cursor=encode_candidate_cursor(rows[0]) if has_previous else None,
        has_next=has_next,
        has_previous=has_previous,
        limit=limit,
    )


@router.post(
    "/review-queue/{candidate_id}/decision",
    response_model=EnforcementCaseRead | ViolationCandidateRead,
)
async def decide_national_candidate(
    candidate_id: uuid.UUID,
    payload: CandidateDecision,
    user: SuperAdmin,
    session: Session,
) -> EnforcementCase | ViolationCandidate:
    candidate = await get_candidate_or_404(session, candidate_id)
    if candidate.status != ViolationStatus.PENDING_REVIEW:
        raise HTTPException(status_code=409, detail="This candidate has already been reviewed")
    if candidate.review_organization_id is None:
        raise HTTPException(status_code=422, detail="Candidate has no responsible police organization")

    now = datetime.now(timezone.utc)
    candidate.reviewed_by_user_id = user.id
    candidate.reviewed_by = user.display_name
    candidate.reviewed_at = now
    candidate.review_note = payload.review_note

    if payload.decision == "reject":
        candidate.status = ViolationStatus.REJECTED
        session.add(
            AuditLog(
                actor_user_id=user.id,
                action="violation_candidate.rejected",
                resource_type="violation_candidate",
                resource_public_id=candidate.id,
                reason=payload.review_note,
            )
        )
        await session.commit()
        await session.refresh(candidate)
        return candidate

    candidate.status = ViolationStatus.APPROVED
    case_number = candidate.case_number or f"CASE-{now:%Y%m%d}-{candidate.id.hex[:8].upper()}"
    candidate.case_number = case_number
    case = EnforcementCase(
        case_number=case_number,
        candidate_id=candidate.id,
        organization_id=candidate.review_organization_id,
        status="open",
        opened_by_user_id=user.id,
        opened_at=now,
        notes=payload.review_note,
    )
    session.add(case)
    await session.flush()
    session.add(
        AuditLog(
            actor_user_id=user.id,
            action="enforcement_case.created",
            resource_type="enforcement_case",
            resource_public_id=case.id,
            new_values={
                "case_number": case.case_number,
                "candidate_id": str(candidate.id),
                "organization_id": case.organization_id,
            },
            reason=payload.review_note,
        )
    )
    await session.commit()
    await session.refresh(case)
    return case


@router.get("/cases", response_model=list[EnforcementCaseRead])
async def national_cases(
    _: SuperAdmin,
    session: Session,
    status: str | None = None,
) -> list[EnforcementCase]:
    query = select(EnforcementCase).order_by(EnforcementCase.opened_at.desc())
    if status:
        query = query.where(EnforcementCase.status == status)
    return list(await session.scalars(query))
