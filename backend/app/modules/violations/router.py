import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ReviewDecision, ViolationStatus
from app.core.database import get_session
from app.modules.violations.model import ViolationCandidate
from app.modules.violations.schema import ViolationRead, ViolationReview

router = APIRouter(prefix="/violations", tags=["Violation review"])


@router.get("", response_model=list[ViolationRead])
async def list_violations(
    violation_status: ViolationStatus | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_session),
) -> list[ViolationCandidate]:
    query = select(ViolationCandidate).order_by(ViolationCandidate.detected_at.desc())
    if violation_status is not None:
        query = query.where(ViolationCandidate.status == violation_status)
    result = await session.scalars(query)
    return list(result)


@router.post("/{violation_id}/review", response_model=ViolationRead)
async def review_violation(
    violation_id: uuid.UUID,
    payload: ViolationReview,
    session: AsyncSession = Depends(get_session),
) -> ViolationCandidate:
    violation = await session.get(ViolationCandidate, violation_id)
    if violation is None:
        raise HTTPException(status_code=404, detail="Violation candidate not found")
    if violation.status != ViolationStatus.PENDING_REVIEW:
        raise HTTPException(status_code=409, detail="Violation has already been reviewed")

    violation.reviewed_by = payload.officer_id
    violation.reviewed_at = datetime.now(UTC)
    violation.review_note = payload.note

    if payload.decision == ReviewDecision.APPROVE:
        violation.status = ViolationStatus.APPROVED
        violation.case_number = f"NVE-{violation.reviewed_at.year}-{violation.id.hex[:10].upper()}"
    else:
        violation.status = ViolationStatus.REJECTED

    await session.commit()
    await session.refresh(violation)
    return violation
