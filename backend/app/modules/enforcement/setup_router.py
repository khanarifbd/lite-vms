import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EnforcementAreaType, EnforcementScope, EnforcementSeverity, UserRole, ViolationType
from app.core.database import get_session
from app.modules.audit.model import AuditLog
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.enforcement.model import EnforcementJurisdiction, EnforcementPolicy, SpeedRule
from app.modules.enforcement.schema import EnforcementPolicyRead, SpeedRuleRead
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/admin/enforcement", tags=["Admin enforcement configuration"])
AdminUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN))]
Session = Annotated[AsyncSession, Depends(get_session)]


class OverspeedSetupCreate(BaseModel):
    policy_name: str = Field(min_length=3, max_length=160)
    severity: EnforcementSeverity = EnforcementSeverity.MEDIUM
    minimum_duration_seconds: int = Field(default=10, ge=0, le=3600)
    minimum_consecutive_packets: int = Field(default=3, ge=1, le=100)
    cooldown_seconds: int = Field(default=300, ge=0, le=86400)
    acceptable_packet_delay_seconds: int = Field(default=120, ge=0, le=3600)
    rule_name: str = Field(min_length=3, max_length=180)
    jurisdiction_id: uuid.UUID | None = None
    area_type: Literal["national", "polygon"] = "national"
    geometry: dict | None = None
    maximum_speed_kph: float = Field(gt=0, le=300)
    tolerance_kph: float = Field(default=5, ge=0, le=50)
    vehicle_scope: Literal["all", "exclude_selected", "include_selected"] = "all"
    vehicle_ids: list[uuid.UUID] | None = None
    priority: int = Field(default=100, ge=0, le=10000)

    @model_validator(mode="after")
    def validate_area(self):
        if self.area_type == "national" and self.geometry is not None:
            raise ValueError("National rules must not include geometry")
        if self.area_type == "polygon":
            if not self.geometry or self.geometry.get("type") != "Polygon":
                raise ValueError("A GeoJSON Polygon is required for a zone rule")
            coordinates = self.geometry.get("coordinates")
            if not isinstance(coordinates, list) or not coordinates or not isinstance(coordinates[0], list):
                raise ValueError("Polygon coordinates are invalid")
            ring = coordinates[0]
            if len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError("Polygon must contain at least three points and be closed")
        return self


class OverspeedSetupRead(BaseModel):
    policy: EnforcementPolicyRead
    speed_rule: SpeedRuleRead


@router.post("/overspeed-setups", response_model=OverspeedSetupRead, status_code=201)
async def create_overspeed_setup(payload: OverspeedSetupCreate, user: AdminUser, session: Session):
    if payload.vehicle_scope == "all" and payload.vehicle_ids:
        raise HTTPException(status_code=422, detail="Vehicle list must be empty when the rule applies to all vehicles")
    if payload.vehicle_scope != "all" and not payload.vehicle_ids:
        raise HTTPException(status_code=422, detail="Select at least one vehicle for this vehicle scope")
    if payload.vehicle_ids and len(set(payload.vehicle_ids)) != len(payload.vehicle_ids):
        raise HTTPException(status_code=422, detail="Vehicle list contains duplicates")

    if payload.jurisdiction_id is not None:
        jurisdiction = await session.get(EnforcementJurisdiction, payload.jurisdiction_id)
        if jurisdiction is None:
            raise HTTPException(status_code=404, detail="Enforcement jurisdiction not found")

    if payload.vehicle_ids:
        for vehicle_id in payload.vehicle_ids:
            if await session.get(Vehicle, vehicle_id) is None:
                raise HTTPException(status_code=404, detail=f"Vehicle not found: {vehicle_id}")

    policy = EnforcementPolicy(
        name=payload.policy_name,
        violation_type=ViolationType.OVERSPEED,
        scope=EnforcementScope.ZONE if payload.area_type == "polygon" else EnforcementScope.NATIONAL,
        severity=payload.severity,
        minimum_duration_seconds=payload.minimum_duration_seconds,
        minimum_consecutive_packets=payload.minimum_consecutive_packets,
        cooldown_seconds=payload.cooldown_seconds,
        acceptable_packet_delay_seconds=payload.acceptable_packet_delay_seconds,
        review_required=True,
        auto_create_candidate=True,
        auto_create_case=False,
        enabled=True,
        notes="Created through the guided traffic-rule wizard.",
        created_by_user_id=user.id,
    )
    session.add(policy)

    try:
        await session.flush()
        speed_rule = SpeedRule(
            name=payload.rule_name,
            policy_id=policy.id,
            jurisdiction_id=payload.jurisdiction_id,
            area_type=EnforcementAreaType.POLYGON if payload.area_type == "polygon" else EnforcementAreaType.NATIONAL,
            geometry=payload.geometry,
            maximum_speed_kph=payload.maximum_speed_kph,
            tolerance_kph=payload.tolerance_kph,
            vehicle_scope=payload.vehicle_scope,
            vehicle_ids=payload.vehicle_ids,
            vehicle_categories=None,
            active_days=None,
            active_start_time=None,
            active_end_time=None,
            priority=payload.priority,
            enabled=True,
        )
        session.add(speed_rule)
        await session.flush()
        session.add(
            AuditLog(
                actor_user_id=user.id,
                action="enforcement_overspeed_setup.created",
                resource_type="speed_rule",
                resource_public_id=speed_rule.id,
                new_values={
                    "policy_id": str(policy.id),
                    "policy_name": policy.name,
                    "rule_name": speed_rule.name,
                    "area_type": speed_rule.area_type.value,
                    "geometry": speed_rule.geometry,
                    "maximum_speed_kph": speed_rule.maximum_speed_kph,
                    "tolerance_kph": speed_rule.tolerance_kph,
                    "vehicle_scope": speed_rule.vehicle_scope,
                    "vehicle_ids": [str(value) for value in speed_rule.vehicle_ids or []],
                },
                reason="Created through guided setup",
            )
        )
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Policy or speed-rule name already exists") from exc

    await session.refresh(policy)
    await session.refresh(speed_rule)
    return {"policy": policy, "speed_rule": speed_rule}
