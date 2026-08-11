import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    MembershipStatus,
    OrganizationStatus,
    OrganizationType,
    UserRole,
    ViolationStatus,
    ViolationType,
)
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
from app.modules.enforcement.schema import (
    CandidateDecision,
    EnforcementCaseRead,
    EnforcementPolicyCreate,
    EnforcementPolicyHistoryRead,
    EnforcementPolicyRead,
    EnforcementPolicyUpdate,
    GeofenceCreate,
    GeofenceRead,
    GeofenceUpdate,
    JurisdictionCreate,
    JurisdictionRead,
    PoliceOrganizationRead,
    SpeedRuleCreate,
    SpeedRuleRead,
    SpeedRuleUpdate,
    VehicleExemptionCreate,
    VehicleExemptionRead,
    ViolationCandidateRead,
)
from app.modules.iam.model import Organization, OrganizationMembership
from app.modules.vehicles.model import Vehicle
from app.modules.violations.model import ViolationCandidate

router = APIRouter(prefix="/admin/enforcement", tags=["Admin enforcement"])
CONFIG_ROLES = (UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)
REVIEW_ROLES = (UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN, UserRole.POLICE_OFFICER)
ConfigUser = Annotated[User, Depends(require_roles(*CONFIG_ROLES))]
ReviewerUser = Annotated[User, Depends(require_roles(*REVIEW_ROLES))]
Session = Annotated[AsyncSession, Depends(get_session)]


async def get_or_404(session: AsyncSession, model, object_id, detail: str):
    item = await session.get(model, object_id)
    if item is None:
        raise HTTPException(status_code=404, detail=detail)
    return item


def policy_snapshot(item: EnforcementPolicy) -> dict:
    return EnforcementPolicyRead.model_validate(item).model_dump(mode="json")


def geofence_snapshot(item: EnforcementGeofence) -> dict:
    return GeofenceRead.model_validate(item).model_dump(mode="json")


def rule_snapshot(item: SpeedRule) -> dict:
    return SpeedRuleRead.model_validate(item).model_dump(mode="json")


async def active_organization_ids(session: AsyncSession, user_id: int) -> set[int]:
    query = select(OrganizationMembership.organization_id).where(
        OrganizationMembership.user_id == user_id,
        OrganizationMembership.status == MembershipStatus.ACTIVE,
    )
    return set(await session.scalars(query))


async def ensure_candidate_access(session: AsyncSession, user: User, candidate: ViolationCandidate) -> None:
    organization_ids = await active_organization_ids(session, user.id)
    if organization_ids and candidate.review_organization_id not in organization_ids:
        raise HTTPException(status_code=403, detail="This candidate belongs to another police organization")


@router.get("/police-organizations", response_model=list[PoliceOrganizationRead])
async def list_police_organizations(_: ConfigUser, session: Session):
    query = select(Organization).where(
        Organization.organization_type.in_([
            OrganizationType.BANGLADESH_POLICE,
            OrganizationType.POLICE_UNIT,
        ]),
        Organization.status == OrganizationStatus.ACTIVE,
    ).order_by(Organization.name_en)
    items = list(await session.scalars(query))
    return [PoliceOrganizationRead(
        id=item.id,
        public_id=item.public_id,
        name_en=item.name_en,
        name_bn=item.name_bn,
        organization_type=item.organization_type.value,
    ) for item in items]


# Reusable violation policies -------------------------------------------------

@router.get("/policies", response_model=list[EnforcementPolicyRead])
async def list_policies(_: ConfigUser, session: Session, violation_type: ViolationType | None = None, enabled: bool | None = None):
    query = select(EnforcementPolicy).order_by(EnforcementPolicy.name)
    if violation_type is not None:
        query = query.where(EnforcementPolicy.violation_type == violation_type)
    if enabled is not None:
        query = query.where(EnforcementPolicy.enabled == enabled)
    return list(await session.scalars(query))


@router.post("/policies", response_model=EnforcementPolicyRead, status_code=201)
async def create_policy(payload: EnforcementPolicyCreate, user: ConfigUser, session: Session):
    item = EnforcementPolicy(**payload.model_dump(), created_by_user_id=user.id)
    session.add(item)
    try:
        await session.flush()
        session.add(AuditLog(actor_user_id=user.id, action="enforcement_policy.created", resource_type="enforcement_policy", resource_public_id=item.id, new_values=policy_snapshot(item), reason="Initial policy creation"))
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=409, detail="An enforcement policy with this name already exists")
    await session.refresh(item)
    return item


@router.put("/policies/{policy_id}", response_model=EnforcementPolicyRead)
async def update_policy(policy_id: uuid.UUID, payload: EnforcementPolicyUpdate, user: ConfigUser, session: Session):
    item = await get_or_404(session, EnforcementPolicy, policy_id, "Enforcement policy not found")
    previous = policy_snapshot(item)
    for field, value in payload.model_dump(exclude={"change_note"}).items():
        setattr(item, field, value)
    await session.flush()
    session.add(AuditLog(actor_user_id=user.id, action="enforcement_policy.updated", resource_type="enforcement_policy", resource_public_id=item.id, previous_values=previous, new_values=policy_snapshot(item), reason=payload.change_note))
    await session.commit()
    await session.refresh(item)
    return item


@router.delete("/policies/{policy_id}", status_code=204)
async def delete_policy(policy_id: uuid.UUID, user: ConfigUser, session: Session, change_note: str = Query(min_length=3, max_length=1000)):
    item = await get_or_404(session, EnforcementPolicy, policy_id, "Enforcement policy not found")
    count = await session.scalar(select(func.count()).select_from(SpeedRule).where(SpeedRule.policy_id == item.id))
    if count:
        raise HTTPException(status_code=409, detail="This policy is used by rules. Disable it instead")
    previous = policy_snapshot(item)
    await session.delete(item)
    session.add(AuditLog(actor_user_id=user.id, action="enforcement_policy.deleted", resource_type="enforcement_policy", resource_public_id=item.id, previous_values=previous, reason=change_note))
    await session.commit()


@router.get("/policies/{policy_id}/history", response_model=list[EnforcementPolicyHistoryRead])
async def policy_history(policy_id: uuid.UUID, _: ConfigUser, session: Session):
    await get_or_404(session, EnforcementPolicy, policy_id, "Enforcement policy not found")
    query = select(AuditLog).where(AuditLog.resource_type == "enforcement_policy", AuditLog.resource_public_id == policy_id).order_by(AuditLog.created_at.desc())
    return list(await session.scalars(query))


# Reusable geofences ----------------------------------------------------------

@router.get("/geofences", response_model=list[GeofenceRead])
async def list_geofences(_: ConfigUser, session: Session, enabled: bool | None = None):
    query = select(EnforcementGeofence).order_by(EnforcementGeofence.name)
    if enabled is not None:
        query = query.where(EnforcementGeofence.enabled == enabled)
    return list(await session.scalars(query))


@router.post("/geofences", response_model=GeofenceRead, status_code=201)
async def create_geofence(payload: GeofenceCreate, user: ConfigUser, session: Session):
    item = EnforcementGeofence(**payload.model_dump(), created_by_user_id=user.id)
    session.add(item)
    try:
        await session.flush()
        session.add(AuditLog(actor_user_id=user.id, action="enforcement_geofence.created", resource_type="enforcement_geofence", resource_public_id=item.id, new_values=geofence_snapshot(item), reason="Initial geofence creation"))
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=409, detail="A geofence with this name already exists")
    await session.refresh(item)
    return item


@router.put("/geofences/{geofence_id}", response_model=GeofenceRead)
async def update_geofence(geofence_id: uuid.UUID, payload: GeofenceUpdate, user: ConfigUser, session: Session):
    item = await get_or_404(session, EnforcementGeofence, geofence_id, "Geofence not found")
    previous = geofence_snapshot(item)
    for field, value in payload.model_dump(exclude={"change_note"}).items():
        setattr(item, field, value)
    await session.flush()
    session.add(AuditLog(actor_user_id=user.id, action="enforcement_geofence.updated", resource_type="enforcement_geofence", resource_public_id=item.id, previous_values=previous, new_values=geofence_snapshot(item), reason=payload.change_note))
    await session.commit()
    await session.refresh(item)
    return item


@router.delete("/geofences/{geofence_id}", status_code=204)
async def delete_geofence(geofence_id: uuid.UUID, user: ConfigUser, session: Session, change_note: str = Query(min_length=3, max_length=1000)):
    item = await get_or_404(session, EnforcementGeofence, geofence_id, "Geofence not found")
    count = await session.scalar(select(func.count()).select_from(SpeedRule).where(SpeedRule.geofence_id == item.id))
    if count:
        raise HTTPException(status_code=409, detail="This geofence is used by rules. Disable it instead")
    previous = geofence_snapshot(item)
    await session.delete(item)
    session.add(AuditLog(actor_user_id=user.id, action="enforcement_geofence.deleted", resource_type="enforcement_geofence", resource_public_id=item.id, previous_values=previous, reason=change_note))
    await session.commit()


@router.get("/geofences/{geofence_id}/history", response_model=list[EnforcementPolicyHistoryRead])
async def geofence_history(geofence_id: uuid.UUID, _: ConfigUser, session: Session):
    await get_or_404(session, EnforcementGeofence, geofence_id, "Geofence not found")
    query = select(AuditLog).where(AuditLog.resource_type == "enforcement_geofence", AuditLog.resource_public_id == geofence_id).order_by(AuditLog.created_at.desc())
    return list(await session.scalars(query))


# Rules: Policy + national/geofence area + police organization ---------------

@router.get("/rules", response_model=list[SpeedRuleRead])
@router.get("/speed-rules", response_model=list[SpeedRuleRead], include_in_schema=False)
async def list_rules(_: ConfigUser, session: Session, enabled: bool | None = None):
    query = select(SpeedRule).order_by(SpeedRule.priority.desc(), SpeedRule.name)
    if enabled is not None:
        query = query.where(SpeedRule.enabled == enabled)
    return list(await session.scalars(query))


async def validate_rule_references(session: AsyncSession, payload: SpeedRuleCreate):
    policy = await session.get(EnforcementPolicy, payload.policy_id)
    if policy is None or not policy.enabled:
        raise HTTPException(status_code=422, detail="Select an active enforcement policy")
    if payload.geofence_id is not None:
        geofence = await session.get(EnforcementGeofence, payload.geofence_id)
        if geofence is None or not geofence.enabled:
            raise HTTPException(status_code=422, detail="Select an active geofence")
    organization = await session.get(Organization, payload.review_organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Responsible police organization not found")
    if organization.organization_type not in {OrganizationType.BANGLADESH_POLICE, OrganizationType.POLICE_UNIT}:
        raise HTTPException(status_code=422, detail="Responsible organization must be a police organization")
    if organization.status != OrganizationStatus.ACTIVE:
        raise HTTPException(status_code=422, detail="Responsible police organization is not active")
    for vehicle_id in payload.vehicle_ids or []:
        if await session.get(Vehicle, vehicle_id) is None:
            raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found")


@router.post("/rules", response_model=SpeedRuleRead, status_code=201)
@router.post("/speed-rules", response_model=SpeedRuleRead, status_code=201, include_in_schema=False)
async def create_rule(payload: SpeedRuleCreate, user: ConfigUser, session: Session):
    await validate_rule_references(session, payload)
    item = SpeedRule(**payload.model_dump())
    session.add(item)
    try:
        await session.flush()
        session.add(AuditLog(actor_user_id=user.id, action="enforcement_rule.created", resource_type="enforcement_rule", resource_public_id=item.id, new_values=rule_snapshot(item), reason="Initial rule creation"))
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=409, detail="An enforcement rule with this name already exists")
    await session.refresh(item)
    return item


@router.put("/rules/{rule_id}", response_model=SpeedRuleRead)
@router.put("/speed-rules/{rule_id}", response_model=SpeedRuleRead, include_in_schema=False)
async def update_rule(rule_id: uuid.UUID, payload: SpeedRuleUpdate, user: ConfigUser, session: Session):
    await validate_rule_references(session, payload)
    item = await get_or_404(session, SpeedRule, rule_id, "Enforcement rule not found")
    previous = rule_snapshot(item)
    for field, value in payload.model_dump(exclude={"change_note"}).items():
        setattr(item, field, value)
    await session.flush()
    session.add(AuditLog(actor_user_id=user.id, action="enforcement_rule.updated", resource_type="enforcement_rule", resource_public_id=item.id, previous_values=previous, new_values=rule_snapshot(item), reason=payload.change_note))
    await session.commit()
    await session.refresh(item)
    return item


@router.get("/rules/{rule_id}/history", response_model=list[EnforcementPolicyHistoryRead])
async def rule_history(rule_id: uuid.UUID, _: ConfigUser, session: Session):
    await get_or_404(session, SpeedRule, rule_id, "Enforcement rule not found")
    query = select(AuditLog).where(AuditLog.resource_type.in_(["enforcement_rule", "speed_rule"]), AuditLog.resource_public_id == rule_id).order_by(AuditLog.created_at.desc())
    return list(await session.scalars(query))


# Legacy jurisdiction compatibility during test-data migration ----------------

@router.get("/jurisdictions", response_model=list[JurisdictionRead], include_in_schema=False)
async def list_jurisdictions(_: ConfigUser, session: Session, enabled: bool | None = None):
    query = select(EnforcementJurisdiction).order_by(EnforcementJurisdiction.priority, EnforcementJurisdiction.name)
    if enabled is not None:
        query = query.where(EnforcementJurisdiction.enabled == enabled)
    return list(await session.scalars(query))


@router.post("/jurisdictions", response_model=JurisdictionRead, status_code=201, include_in_schema=False)
async def create_jurisdiction(payload: JurisdictionCreate, _: ConfigUser, session: Session):
    item = EnforcementJurisdiction(**payload.model_dump())
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


# Organization-scoped review queue and cases ---------------------------------

@router.get("/review-queue", response_model=list[ViolationCandidateRead])
async def review_queue(user: ReviewerUser, session: Session, status: ViolationStatus = ViolationStatus.PENDING_REVIEW):
    query = select(ViolationCandidate).where(ViolationCandidate.status == status).order_by(ViolationCandidate.detected_at.desc())
    organization_ids = await active_organization_ids(session, user.id)
    if organization_ids:
        query = query.where(ViolationCandidate.review_organization_id.in_(organization_ids))
    return list(await session.scalars(query))


@router.post("/review-queue/{candidate_id}/decision", response_model=EnforcementCaseRead | ViolationCandidateRead)
async def decide_candidate(candidate_id: uuid.UUID, payload: CandidateDecision, user: ReviewerUser, session: Session):
    candidate = await get_or_404(session, ViolationCandidate, candidate_id, "Violation candidate not found")
    await ensure_candidate_access(session, user, candidate)
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
        session.add(AuditLog(actor_user_id=user.id, action="violation_candidate.rejected", resource_type="violation_candidate", resource_public_id=candidate.id, reason=payload.review_note))
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
    session.add(AuditLog(actor_user_id=user.id, action="enforcement_case.created", resource_type="enforcement_case", resource_public_id=case.id, new_values={"case_number": case.case_number, "candidate_id": str(candidate.id), "organization_id": case.organization_id}, reason=payload.review_note))
    await session.commit()
    await session.refresh(case)
    return case


@router.get("/cases", response_model=list[EnforcementCaseRead])
async def list_cases(user: ReviewerUser, session: Session, status: str | None = None):
    query = select(EnforcementCase).order_by(EnforcementCase.opened_at.desc())
    if status:
        query = query.where(EnforcementCase.status == status)
    organization_ids = await active_organization_ids(session, user.id)
    if organization_ids:
        query = query.where(EnforcementCase.organization_id.in_(organization_ids))
    return list(await session.scalars(query))


# Vehicle exceptions ----------------------------------------------------------

@router.get("/vehicle-exemptions", response_model=list[VehicleExemptionRead])
async def list_vehicle_exemptions(_: ConfigUser, session: Session, vehicle_id: uuid.UUID | None = None, enabled: bool | None = None):
    query = select(VehicleEnforcementExemption).order_by(VehicleEnforcementExemption.valid_from.desc())
    if vehicle_id is not None:
        query = query.where(VehicleEnforcementExemption.vehicle_id == vehicle_id)
    if enabled is not None:
        query = query.where(VehicleEnforcementExemption.enabled == enabled)
    return list(await session.scalars(query))


@router.post("/vehicle-exemptions", response_model=VehicleExemptionRead, status_code=201)
async def create_vehicle_exemption(payload: VehicleExemptionCreate, user: ConfigUser, session: Session):
    if await session.get(Vehicle, payload.vehicle_id) is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    item = VehicleEnforcementExemption(**payload.model_dump(), approved_by_user_id=user.id)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.patch("/{resource}/{item_id}/enabled", status_code=204)
async def set_resource_enabled(resource: str, item_id: uuid.UUID, user: ConfigUser, session: Session, enabled: bool = Query(...), change_note: str = Query(min_length=3, max_length=1000)):
    models = {
        "policies": EnforcementPolicy,
        "geofences": EnforcementGeofence,
        "rules": SpeedRule,
        "speed-rules": SpeedRule,
        "vehicle-exemptions": VehicleEnforcementExemption,
    }
    model = models.get(resource)
    if model is None:
        raise HTTPException(status_code=404, detail="Unknown enforcement resource")
    item = await get_or_404(session, model, item_id, "Enforcement resource not found")
    previous_enabled = item.enabled
    item.enabled = enabled
    session.add(AuditLog(actor_user_id=user.id, action=f"{resource}.enabled_changed", resource_type=resource.rstrip("s"), resource_public_id=item.id, previous_values={"enabled": previous_enabled}, new_values={"enabled": enabled}, reason=change_note))
    await session.commit()
