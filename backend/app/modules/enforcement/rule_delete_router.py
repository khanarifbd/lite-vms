import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.audit.model import AuditLog
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.enforcement.model import EnforcementCase, SpeedRule
from app.modules.violations.model import ViolationCandidate

router = APIRouter(prefix="/admin/enforcement", tags=["Admin enforcement"])
ConfigUser = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
]
Session = Annotated[AsyncSession, Depends(get_session)]


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: uuid.UUID,
    user: ConfigUser,
    session: Session,
    change_note: str = Query(min_length=3, max_length=1000),
):
    item = await session.get(SpeedRule, rule_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Enforcement rule not found")

    candidate_count = await session.scalar(
        select(func.count()).select_from(ViolationCandidate).where(
            ViolationCandidate.rule_id == item.id
        )
    )
    case_count = await session.scalar(
        select(func.count()).select_from(EnforcementCase).join(
            ViolationCandidate,
            EnforcementCase.candidate_id == ViolationCandidate.id,
        ).where(ViolationCandidate.rule_id == item.id)
    )
    if candidate_count or case_count:
        raise HTTPException(
            status_code=409,
            detail="This rule has violation evidence or cases. Disable it instead",
        )

    session.add(
        AuditLog(
            actor_user_id=user.id,
            action="enforcement_rule.deleted",
            resource_type="enforcement_rule",
            resource_public_id=item.id,
            previous_values={
                "name": item.name,
                "policy_id": str(item.policy_id),
                "geofence_id": str(item.geofence_id) if item.geofence_id else None,
                "review_organization_id": item.review_organization_id,
                "enabled": item.enabled,
            },
            reason=change_note,
        )
    )
    await session.delete(item)
    await session.commit()
