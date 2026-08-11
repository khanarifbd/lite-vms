import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from typing import Any

from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EnforcementAreaType, ViolationStatus, ViolationType
from app.modules.enforcement.model import (
    EnforcementGeofence,
    EnforcementPolicy,
    SpeedRule,
    VehicleEnforcementExemption,
)
from app.modules.telemetry.model import TelemetryPoint
from app.modules.vehicles.model import Vehicle
from app.modules.violations.model import ViolationCandidate


@dataclass(frozen=True)
class MatchedRule:
    rule: SpeedRule
    policy: EnforcementPolicy
    geofence: EnforcementGeofence | None


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _normalized_vehicle_classes(vehicle: Vehicle) -> set[str]:
    values = {vehicle.vehicle_type, vehicle.vehicle_category, vehicle.body_type}
    normalized: set[str] = set()
    aliases = {
        "car": "private_car",
        "private": "private_car",
        "privatecar": "private_car",
        "coveredvan": "covered_van",
        "cng": "three_wheeler",
        "threewheeler": "three_wheeler",
        "auto_rickshaw": "three_wheeler",
    }
    for value in values:
        if not value:
            continue
        token = value.strip().lower().replace("-", "_").replace(" ", "_")
        compact = token.replace("_", "")
        normalized.add(token)
        normalized.add(aliases.get(token, aliases.get(compact, token)))
    return normalized


def _point_in_ring(latitude: float, longitude: float, ring: list[Any]) -> bool:
    points: list[tuple[float, float]] = []
    for coordinate in ring:
        if isinstance(coordinate, list) and len(coordinate) >= 2:
            try:
                points.append((float(coordinate[1]), float(coordinate[0])))
            except (TypeError, ValueError):
                continue
    if len(points) < 3:
        return False

    inside = False
    previous = points[-1]
    for current in points:
        y1, x1 = previous
        y2, x2 = current
        if (y1 > latitude) != (y2 > latitude):
            intersection_x = (x2 - x1) * (latitude - y1) / ((y2 - y1) or 1e-15) + x1
            if longitude < intersection_x:
                inside = not inside
        previous = current
    return inside


def _inside_geofence(geofence: EnforcementGeofence | None, latitude: float, longitude: float) -> bool:
    if geofence is None or not isinstance(geofence.geometry, dict):
        return False
    geometry_type = geofence.geometry.get("type")
    coordinates = geofence.geometry.get("coordinates")
    if geometry_type == "Polygon" and isinstance(coordinates, list) and coordinates:
        return _point_in_ring(latitude, longitude, coordinates[0])
    if geometry_type == "MultiPolygon" and isinstance(coordinates, list):
        return any(
            isinstance(polygon, list) and polygon and _point_in_ring(latitude, longitude, polygon[0])
            for polygon in coordinates
        )
    return False


def _window_is_active(item: SpeedRule | EnforcementPolicy, received_at: datetime) -> bool:
    effective_from = _utc(item.effective_from)
    effective_to = _utc(item.effective_to)
    return not (effective_from and received_at < effective_from) and not (
        effective_to and received_at >= effective_to
    )


def _rule_schedule_is_active(rule: SpeedRule, received_at: datetime) -> bool:
    if not _window_is_active(rule, received_at):
        return False
    if rule.active_days and received_at.weekday() not in rule.active_days:
        return False
    if not rule.active_start_time or not rule.active_end_time:
        return True
    start = time.fromisoformat(rule.active_start_time)
    end = time.fromisoformat(rule.active_end_time)
    current = received_at.time().replace(tzinfo=None)
    return start <= current < end if start <= end else current >= start or current < end


def _vehicle_matches(rule: SpeedRule, vehicle: Vehicle) -> bool:
    vehicle_id = str(vehicle.id)
    selected = {str(value) for value in (rule.vehicle_ids or [])}
    if rule.vehicle_scope == "include_selected" and vehicle_id not in selected:
        return False
    if rule.vehicle_scope == "exclude_selected" and vehicle_id in selected:
        return False
    categories = {str(value).strip().lower() for value in (rule.vehicle_categories or [])}
    return not categories or bool(categories & _normalized_vehicle_classes(vehicle))


async def _is_exempt(session: AsyncSession, vehicle_id: uuid.UUID, received_at: datetime) -> bool:
    exemption_id = await session.scalar(
        select(VehicleEnforcementExemption.id).where(
            VehicleEnforcementExemption.vehicle_id == vehicle_id,
            VehicleEnforcementExemption.enabled.is_(True),
            VehicleEnforcementExemption.valid_from <= received_at,
            or_(
                VehicleEnforcementExemption.valid_to.is_(None),
                VehicleEnforcementExemption.valid_to > received_at,
            ),
            or_(
                VehicleEnforcementExemption.violation_type.is_(None),
                VehicleEnforcementExemption.violation_type == ViolationType.OVERSPEED,
            ),
        ).limit(1)
    )
    return exemption_id is not None


async def resolve_best_rule(
    session: AsyncSession,
    *,
    vehicle: Vehicle,
    latitude: float,
    longitude: float,
    received_at: datetime,
) -> MatchedRule | None:
    rows = (
        await session.execute(
            select(SpeedRule, EnforcementPolicy, EnforcementGeofence)
            .join(EnforcementPolicy, EnforcementPolicy.id == SpeedRule.policy_id)
            .outerjoin(EnforcementGeofence, EnforcementGeofence.id == SpeedRule.geofence_id)
            .where(
                SpeedRule.enabled.is_(True),
                SpeedRule.review_organization_id.is_not(None),
                EnforcementPolicy.enabled.is_(True),
                EnforcementPolicy.violation_type == ViolationType.OVERSPEED,
                EnforcementPolicy.auto_create_candidate.is_(True),
            )
            .order_by(desc(SpeedRule.priority), SpeedRule.created_at.asc())
        )
    ).all()

    for rule, policy, geofence in rows:
        if not _window_is_active(policy, received_at):
            continue
        if not _rule_schedule_is_active(rule, received_at) or not _vehicle_matches(rule, vehicle):
            continue
        if rule.area_type == EnforcementAreaType.NATIONAL:
            return MatchedRule(rule=rule, policy=policy, geofence=None)
        if geofence is not None and geofence.enabled and _inside_geofence(geofence, latitude, longitude):
            return MatchedRule(rule=rule, policy=policy, geofence=geofence)
    return None


async def detect_overspeed(
    session: AsyncSession,
    *,
    telemetry: TelemetryPoint,
    vehicle: Vehicle,
) -> ViolationCandidate | None:
    received_at = _utc(telemetry.received_at) or datetime.now(UTC)
    recorded_at = _utc(telemetry.recorded_at) or received_at
    matched = await resolve_best_rule(
        session,
        vehicle=vehicle,
        latitude=telemetry.latitude,
        longitude=telemetry.longitude,
        received_at=received_at,
    )
    if matched is None:
        telemetry.enforcement_rule_id = None
        telemetry.enforcement_threshold_kph = None
        return None

    rule, policy = matched.rule, matched.policy
    threshold = float(rule.maximum_speed_kph + rule.tolerance_kph)
    telemetry.enforcement_rule_id = rule.id
    telemetry.enforcement_threshold_kph = threshold
    await session.flush()

    if await _is_exempt(session, vehicle.id, received_at):
        return None

    packet_age = received_at - recorded_at
    if packet_age < timedelta(0) or packet_age > timedelta(seconds=policy.acceptable_packet_delay_seconds):
        return None
    if telemetry.speed_kph <= threshold:
        return None

    cooldown_start = received_at - timedelta(seconds=policy.cooldown_seconds)
    recent_candidate = await session.scalar(
        select(ViolationCandidate.id).where(
            ViolationCandidate.vehicle_id == vehicle.id,
            ViolationCandidate.rule_id == rule.id,
            ViolationCandidate.detected_at >= cooldown_start,
        ).limit(1)
    )
    if recent_candidate is not None:
        return None

    history_window = recorded_at - timedelta(
        seconds=max(policy.minimum_duration_seconds + policy.acceptable_packet_delay_seconds, 30)
    )
    points = list(
        await session.scalars(
            select(TelemetryPoint)
            .where(
                TelemetryPoint.vehicle_id == vehicle.id,
                TelemetryPoint.enforcement_rule_id == rule.id,
                TelemetryPoint.enforcement_threshold_kph == threshold,
                TelemetryPoint.recorded_at >= history_window,
                TelemetryPoint.recorded_at <= recorded_at,
            )
            .order_by(desc(TelemetryPoint.recorded_at), desc(TelemetryPoint.received_at))
            .limit(max(policy.minimum_consecutive_packets, 1) + 20)
        )
    )

    consecutive: list[TelemetryPoint] = []
    for point in points:
        point_received = _utc(point.received_at) or received_at
        point_recorded = _utc(point.recorded_at) or point_received
        age = point_received - point_recorded
        if age < timedelta(0) or age > timedelta(seconds=policy.acceptable_packet_delay_seconds):
            break
        if point.speed_kph <= threshold:
            break
        consecutive.append(point)
    if len(consecutive) < policy.minimum_consecutive_packets:
        return None

    oldest_recorded = _utc(consecutive[-1].recorded_at) or recorded_at
    duration_seconds = max(0.0, (recorded_at - oldest_recorded).total_seconds())
    if duration_seconds < policy.minimum_duration_seconds:
        return None

    candidate = ViolationCandidate(
        vehicle_id=vehicle.id,
        driver_id=None,
        telemetry_id=telemetry.id,
        rule_id=rule.id,
        policy_id=policy.id,
        review_organization_id=rule.review_organization_id,
        violation_type=ViolationType.OVERSPEED,
        status=ViolationStatus.PENDING_REVIEW,
        detected_value=telemetry.speed_kph,
        allowed_value=threshold,
        latitude=telemetry.latitude,
        longitude=telemetry.longitude,
        detected_at=received_at,
        evidence={
            "packet_id": telemetry.external_event_id,
            "recorded_at": recorded_at.isoformat(),
            "received_at": received_at.isoformat(),
            "speed_kph": telemetry.speed_kph,
            "official_limit_kph": rule.maximum_speed_kph,
            "tolerance_kph": rule.tolerance_kph,
            "threshold_kph": threshold,
            "consecutive_packets": len(consecutive),
            "duration_seconds": duration_seconds,
            "rule_name": rule.name,
            "policy_name": policy.name,
            "geofence_name": matched.geofence.name if matched.geofence else None,
        },
    )
    session.add(candidate)
    await session.flush()
    return candidate
