import base64
import json
import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, asc, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.enforcement.model import EnforcementCase
from app.modules.enforcement.super_admin_review_router import (
    ViolationCandidateReviewRead,
    build_review_items,
)
from app.modules.violations.model import ViolationCandidate

router = APIRouter(
    prefix="/admin/enforcement/national",
    tags=["Super admin national enforcement cases"],
)
SuperAdmin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]
Session = Annotated[AsyncSession, Depends(get_session)]


class EnforcementCaseReviewRead(BaseModel):
    id: uuid.UUID
    case_number: str
    candidate_id: uuid.UUID
    organization_id: int
    status: str
    opened_by_user_id: int | None
    opened_at: datetime
    closed_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    candidate: ViolationCandidateReviewRead | None = None


class EnforcementCaseCursorPage(BaseModel):
    items: list[EnforcementCaseReviewRead]
    next_cursor: str | None
    previous_cursor: str | None
    has_next: bool
    has_previous: bool
    limit: int


def encode_case_cursor(item: EnforcementCase) -> str:
    payload = json.dumps(
        {"opened_at": item.opened_at.isoformat(), "id": str(item.id)},
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_case_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode((cursor + padding).encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
        opened_at = datetime.fromisoformat(payload["opened_at"])
        case_id = uuid.UUID(payload["id"])
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=400, detail="Invalid enforcement case cursor") from error
    return opened_at, case_id


async def enrich_cases(
    session: AsyncSession,
    cases: list[EnforcementCase],
) -> list[EnforcementCaseReviewRead]:
    if not cases:
        return []

    candidate_ids = {item.candidate_id for item in cases}
    candidates = list(
        await session.scalars(
            select(ViolationCandidate).where(ViolationCandidate.id.in_(candidate_ids))
        )
    )
    enriched_candidates = await build_review_items(session, candidates)
    candidate_by_id = {item.id: item for item in enriched_candidates}

    return [
        EnforcementCaseReviewRead(
            id=item.id,
            case_number=item.case_number,
            candidate_id=item.candidate_id,
            organization_id=item.organization_id,
            status=item.status,
            opened_by_user_id=item.opened_by_user_id,
            opened_at=item.opened_at,
            closed_at=item.closed_at,
            notes=item.notes,
            created_at=item.created_at,
            updated_at=item.updated_at,
            candidate=candidate_by_id.get(item.candidate_id),
        )
        for item in cases
    ]


@router.get("/cases/paginated", response_model=EnforcementCaseCursorPage)
async def national_cases_paginated(
    _: SuperAdmin,
    session: Session,
    status: str | None = Query(default=None, min_length=1, max_length=30),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, min_length=1, max_length=500),
    direction: Literal["next", "previous"] = "next",
) -> EnforcementCaseCursorPage:
    query = select(EnforcementCase)
    if status:
        query = query.where(EnforcementCase.status == status)

    cursor_values = decode_case_cursor(cursor) if cursor else None
    if cursor_values is not None:
        cursor_opened_at, cursor_id = cursor_values
        if direction == "previous":
            query = query.where(
                or_(
                    EnforcementCase.opened_at > cursor_opened_at,
                    and_(
                        EnforcementCase.opened_at == cursor_opened_at,
                        EnforcementCase.id > cursor_id,
                    ),
                )
            ).order_by(asc(EnforcementCase.opened_at), asc(EnforcementCase.id))
        else:
            query = query.where(
                or_(
                    EnforcementCase.opened_at < cursor_opened_at,
                    and_(
                        EnforcementCase.opened_at == cursor_opened_at,
                        EnforcementCase.id < cursor_id,
                    ),
                )
            ).order_by(desc(EnforcementCase.opened_at), desc(EnforcementCase.id))
    else:
        query = query.order_by(desc(EnforcementCase.opened_at), desc(EnforcementCase.id))

    rows = list(await session.scalars(query.limit(limit + 1)))
    has_extra = len(rows) > limit
    rows = rows[:limit]
    if direction == "previous":
        rows.reverse()

    if not rows:
        return EnforcementCaseCursorPage(
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

    return EnforcementCaseCursorPage(
        items=await enrich_cases(session, rows),
        next_cursor=encode_case_cursor(rows[-1]) if has_next else None,
        previous_cursor=encode_case_cursor(rows[0]) if has_previous else None,
        has_next=has_next,
        has_previous=has_previous,
        limit=limit,
    )