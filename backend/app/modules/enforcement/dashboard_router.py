from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EnforcementAreaType, UserRole, ViolationStatus
from app.core.database import get_session
from app.modules.audit.model import AuditLog
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.enforcement.model import (
    EnforcementCase,
    EnforcementGeofence,
    EnforcementJurisdiction,
    EnforcementPolicy,
    SpeedRule,
    VehicleEnforcementExemption,
)
from app.modules.violations.model import ViolationCandidate

router = APIRouter(
    prefix="/admin/enforcement",
    tags=["Admin enforcement dashboard"],
)

ConfigUser = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
]
Session = Annotated[AsyncSession, Depends(get_session)]


class EnforcementDashboardSummary(BaseModel):
    rules_total: int
    rules_active: int
    rules_inactive: int
    national_rules: int
    map_based_rules: int
    geofences_total: int
    geofences_active: int
    policies_total: int
    policies_active: int
    jurisdictions_total: int
    jurisdictions_active: int
    exemptions_total: int
    exemptions_active: int
    exemptions_expiring_soon: int
    candidates_pending_review: int
    cases_open: int
    configuration_changes_24h: int
    generated_at: datetime


async def count_rows(session: AsyncSession, model, *conditions) -> int:
    query = select(func.count()).select_from(model)
    if conditions:
        query = query.where(*conditions)
    return int(await session.scalar(query) or 0)


@router.get("/dashboard-summary", response_model=EnforcementDashboardSummary)
async def enforcement_dashboard_summary(
    _: ConfigUser,
    session: Session,
) -> EnforcementDashboardSummary:
    now = datetime.now(UTC)
    seven_days_from_now = now + timedelta(days=7)
    one_day_ago = now - timedelta(hours=24)

    rules_total = await count_rows(session, SpeedRule)
    rules_active = await count_rows(session, SpeedRule, SpeedRule.enabled.is_(True))
    national_rules = await count_rows(
        session,
        SpeedRule,
        SpeedRule.area_type == EnforcementAreaType.NATIONAL,
    )
    geofences_total = await count_rows(session, EnforcementGeofence)
    geofences_active = await count_rows(
        session,
        EnforcementGeofence,
        EnforcementGeofence.enabled.is_(True),
    )
    policies_total = await count_rows(session, EnforcementPolicy)
    policies_active = await count_rows(
        session,
        EnforcementPolicy,
        EnforcementPolicy.enabled.is_(True),
    )
    jurisdictions_total = await count_rows(session, EnforcementJurisdiction)
    jurisdictions_active = await count_rows(
        session,
        EnforcementJurisdiction,
        EnforcementJurisdiction.enabled.is_(True),
    )
    exemptions_total = await count_rows(session, VehicleEnforcementExemption)
    exemptions_active = await count_rows(
        session,
        VehicleEnforcementExemption,
        VehicleEnforcementExemption.enabled.is_(True),
        VehicleEnforcementExemption.valid_from <= now,
        or_(
            VehicleEnforcementExemption.valid_to.is_(None),
            VehicleEnforcementExemption.valid_to >= now,
        ),
    )
    exemptions_expiring_soon = await count_rows(
        session,
        VehicleEnforcementExemption,
        VehicleEnforcementExemption.enabled.is_(True),
        VehicleEnforcementExemption.valid_to.is_not(None),
        VehicleEnforcementExemption.valid_to >= now,
        VehicleEnforcementExemption.valid_to <= seven_days_from_now,
    )
    candidates_pending_review = await count_rows(
        session,
        ViolationCandidate,
        ViolationCandidate.status == ViolationStatus.PENDING_REVIEW,
    )
    cases_open = await count_rows(
        session,
        EnforcementCase,
        EnforcementCase.status == "open",
    )

    # Audit history is informative, not critical to dashboard availability.
    # Older deployments may contain legacy audit rows or schema differences,
    # so this metric must never make the operational dashboard unavailable.
    try:
        configuration_changes_24h = await count_rows(
            session,
            AuditLog,
            AuditLog.created_at >= one_day_ago,
            AuditLog.resource_type.in_(
                [
                    "enforcement_policy",
                    "enforcement_geofence",
                    "speed_rule",
                    "enforcement_jurisdiction",
                    "vehicle_enforcement_exemption",
                ]
            ),
        )
    except Exception:
        await session.rollback()
        configuration_changes_24h = 0

    return EnforcementDashboardSummary(
        rules_total=rules_total,
        rules_active=rules_active,
        rules_inactive=max(0, rules_total - rules_active),
        national_rules=national_rules,
        map_based_rules=max(0, rules_total - national_rules),
        geofences_total=geofences_total,
        geofences_active=geofences_active,
        policies_total=policies_total,
        policies_active=policies_active,
        jurisdictions_total=jurisdictions_total,
        jurisdictions_active=jurisdictions_active,
        exemptions_total=exemptions_total,
        exemptions_active=exemptions_active,
        exemptions_expiring_soon=exemptions_expiring_soon,
        candidates_pending_review=candidates_pending_review,
        cases_open=cases_open,
        configuration_changes_24h=configuration_changes_24h,
        generated_at=now,
    )
