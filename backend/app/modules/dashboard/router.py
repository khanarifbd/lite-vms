from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, case, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    MembershipStatus,
    OwnerVerificationStatus,
    ProviderStatus,
    TrackingAssignmentStatus,
    UserRole,
    UserStatus,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User, UserIdentifier
from app.modules.dashboard.schema import (
    DashboardPending,
    DashboardTotals,
    OwnerDashboardAction,
    OwnerDashboardDocumentAlert,
    OwnerDashboardOwnerSummary,
    OwnerDashboardStats,
    OwnerDashboardSummary,
    OwnerDashboardVehicleSummary,
    RecentProviderSummary,
    RecentUserSummary,
    SuperAdminDashboardSummary,
)
from app.modules.iam.model import MembershipRole, OrganizationMembership, Role
from app.modules.owners.enums import OwnerProviderLinkStatus
from app.modules.owners.model import VehicleOwner, VTSProviderOwnerLink
from app.modules.owners.service import get_owner_for_user
from app.modules.providers.model import VTSProvider
from app.modules.tracking.model import TrackingDevice, VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def count_for(model: type, *conditions):
    return select(func.count()).select_from(model).where(*conditions).scalar_subquery()


def active_vehicle_assignment_count():
    return (
        select(func.count(VehicleDeviceAssignment.id))
        .where(
            VehicleDeviceAssignment.vehicle_id == Vehicle.id,
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.is_primary.is_(True),
        )
        .correlate(Vehicle)
        .scalar_subquery()
    )


def active_vehicle_tracking_last_seen():
    return (
        select(TrackingDevice.last_seen_at)
        .join(
            VehicleDeviceAssignment,
            VehicleDeviceAssignment.device_id == TrackingDevice.id,
        )
        .where(
            VehicleDeviceAssignment.vehicle_id == Vehicle.id,
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.is_primary.is_(True),
        )
        .order_by(VehicleDeviceAssignment.valid_from.desc())
        .limit(1)
        .correlate(Vehicle)
        .scalar_subquery()
    )


@router.get("/super-admin", response_model=SuperAdminDashboardSummary)
async def super_admin_dashboard(
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SuperAdminDashboardSummary:
    counts = (
        await session.execute(
            select(
                count_for(User, User.deleted_at.is_(None)).label("users"),
                count_for(
                    User,
                    User.deleted_at.is_(None),
                    User.status == UserStatus.ACTIVE,
                ).label("active_users"),
                count_for(VTSProvider).label("providers"),
                count_for(VTSProvider, VTSProvider.status == ProviderStatus.APPROVED).label(
                    "approved_providers"
                ),
                count_for(VehicleOwner).label("owners"),
                count_for(Vehicle).label("vehicles"),
                count_for(VTSProvider, VTSProvider.status == ProviderStatus.PENDING).label(
                    "pending_providers"
                ),
                count_for(
                    VehicleOwner,
                    VehicleOwner.verification_status == OwnerVerificationStatus.PENDING,
                ).label("pending_owners"),
                count_for(
                    Vehicle,
                    Vehicle.verification_status
                    == VehicleVerificationStatus.PENDING_VERIFICATION,
                ).label("pending_vehicles"),
            )
        )
    ).one()

    identifier_subquery = (
        select(UserIdentifier.normalized_value)
        .where(
            UserIdentifier.user_id == User.id,
            UserIdentifier.is_primary.is_(True),
            UserIdentifier.disabled_at.is_(None),
        )
        .order_by(UserIdentifier.id.asc())
        .limit(1)
        .correlate(User)
        .scalar_subquery()
    )
    role_subquery = (
        select(Role.code)
        .join(MembershipRole, MembershipRole.role_id == Role.id)
        .join(
            OrganizationMembership,
            OrganizationMembership.id == MembershipRole.membership_id,
        )
        .where(
            OrganizationMembership.user_id == User.id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
            OrganizationMembership.is_primary.is_(True),
            Role.is_active.is_(True),
        )
        .order_by(MembershipRole.id.asc())
        .limit(1)
        .correlate(User)
        .scalar_subquery()
    )
    recent_user_rows = (
        await session.execute(
            select(
                User.public_id,
                User.display_name,
                User.status,
                User.created_at,
                identifier_subquery.label("primary_identifier"),
                role_subquery.label("primary_role"),
            )
            .where(User.deleted_at.is_(None))
            .order_by(User.created_at.desc())
            .limit(5)
        )
    ).all()

    recent_provider_rows = (
        await session.execute(
            select(
                VTSProvider.id,
                VTSProvider.application_number,
                VTSProvider.code,
                VTSProvider.name.label("legal_name"),
                VTSProvider.district,
                VTSProvider.status,
                VTSProvider.submitted_at,
            )
            .order_by(VTSProvider.created_at.desc())
            .limit(5)
        )
    ).all()

    return SuperAdminDashboardSummary(
        totals=DashboardTotals(
            users=counts.users,
            active_users=counts.active_users,
            providers=counts.providers,
            approved_providers=counts.approved_providers,
            owners=counts.owners,
            vehicles=counts.vehicles,
        ),
        pending=DashboardPending(
            providers=counts.pending_providers,
            owners=counts.pending_owners,
            vehicles=counts.pending_vehicles,
        ),
        recent_users=[RecentUserSummary.model_validate(row._mapping) for row in recent_user_rows],
        recent_providers=[
            RecentProviderSummary.model_validate(row._mapping) for row in recent_provider_rows
        ],
    )


@router.get("/owner", response_model=OwnerDashboardSummary)
async def owner_dashboard(
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerDashboardSummary:
    owner = await get_owner_for_user(session, actor.id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")

    today = date.today()
    document_warning_end = today + timedelta(days=30)
    online_cutoff = datetime.now(UTC) - timedelta(minutes=5)

    active_tracking_count = (
        select(func.count(func.distinct(VehicleDeviceAssignment.vehicle_id)))
        .where(
            VehicleDeviceAssignment.owner_id == owner.id,
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.is_primary.is_(True),
        )
        .scalar_subquery()
    )
    online_tracking_count = (
        select(func.count(func.distinct(VehicleDeviceAssignment.vehicle_id)))
        .join(
            TrackingDevice,
            TrackingDevice.id == VehicleDeviceAssignment.device_id,
        )
        .join(Vehicle, Vehicle.id == VehicleDeviceAssignment.vehicle_id)
        .where(
            VehicleDeviceAssignment.owner_id == owner.id,
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.is_primary.is_(True),
            func.coalesce(TrackingDevice.last_seen_at, Vehicle.last_recorded_at)
            >= online_cutoff,
        )
        .scalar_subquery()
    )

    pending_statuses = [
        VehicleVerificationStatus.DRAFT,
        VehicleVerificationStatus.PENDING_VERIFICATION,
        VehicleVerificationStatus.UNDER_REVIEW,
    ]
    attention_statuses = [
        VehicleVerificationStatus.CHANGES_REQUESTED,
        VehicleVerificationStatus.REJECTED,
        VehicleVerificationStatus.SUSPENDED,
    ]
    counts = (
        await session.execute(
            select(
                count_for(Vehicle, Vehicle.owner_id == owner.id).label("vehicles"),
                count_for(
                    Vehicle,
                    Vehicle.owner_id == owner.id,
                    Vehicle.verification_status == VehicleVerificationStatus.VERIFIED,
                ).label("verified_vehicles"),
                count_for(
                    Vehicle,
                    Vehicle.owner_id == owner.id,
                    Vehicle.verification_status.in_(pending_statuses),
                ).label("pending_vehicles"),
                count_for(
                    Vehicle,
                    Vehicle.owner_id == owner.id,
                    Vehicle.verification_status.in_(attention_statuses),
                ).label("vehicles_needing_attention"),
                active_tracking_count.label("active_tracking_vehicles"),
                online_tracking_count.label("online_vehicles"),
                count_for(
                    VTSProviderOwnerLink,
                    VTSProviderOwnerLink.owner_id == owner.id,
                    VTSProviderOwnerLink.status == OwnerProviderLinkStatus.ACTIVE,
                ).label("active_providers"),
                count_for(
                    VTSProviderOwnerLink,
                    VTSProviderOwnerLink.owner_id == owner.id,
                    VTSProviderOwnerLink.status
                    == OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL,
                ).label("pending_provider_requests"),
            )
        )
    ).one()

    document_expiries = union_all(
        select(
            Vehicle.id.label("vehicle_id"),
            func.coalesce(
                Vehicle.registration_number_display,
                Vehicle.registration_number,
            ).label("registration_number"),
            literal("fitness").label("document_type"),
            Vehicle.fitness_expiry_date.label("expiry_date"),
        ).where(
            Vehicle.owner_id == owner.id,
            Vehicle.fitness_expiry_date.is_not(None),
        ),
        select(
            Vehicle.id.label("vehicle_id"),
            func.coalesce(
                Vehicle.registration_number_display,
                Vehicle.registration_number,
            ).label("registration_number"),
            literal("tax_token").label("document_type"),
            Vehicle.tax_token_expiry_date.label("expiry_date"),
        ).where(
            Vehicle.owner_id == owner.id,
            Vehicle.tax_token_expiry_date.is_not(None),
        ),
        select(
            Vehicle.id.label("vehicle_id"),
            func.coalesce(
                Vehicle.registration_number_display,
                Vehicle.registration_number,
            ).label("registration_number"),
            literal("insurance").label("document_type"),
            Vehicle.insurance_expiry_date.label("expiry_date"),
        ).where(
            Vehicle.owner_id == owner.id,
            Vehicle.insurance_expiry_date.is_not(None),
        ),
        select(
            Vehicle.id.label("vehicle_id"),
            func.coalesce(
                Vehicle.registration_number_display,
                Vehicle.registration_number,
            ).label("registration_number"),
            literal("route_permit").label("document_type"),
            Vehicle.route_permit_expiry_date.label("expiry_date"),
        ).where(
            Vehicle.owner_id == owner.id,
            Vehicle.route_permit_expiry_date.is_not(None),
        ),
    ).subquery()

    document_counts = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(
                        case((document_expiries.c.expiry_date < today, 1), else_=0)
                    ),
                    0,
                ).label("expired_documents"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                and_(
                                    document_expiries.c.expiry_date >= today,
                                    document_expiries.c.expiry_date <= document_warning_end,
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("expiring_documents"),
            ).select_from(document_expiries)
        )
    ).one()

    document_alert_rows = (
        await session.execute(
            select(
                document_expiries.c.vehicle_id,
                document_expiries.c.registration_number,
                document_expiries.c.document_type,
                document_expiries.c.expiry_date,
            )
            .where(document_expiries.c.expiry_date <= document_warning_end)
            .order_by(document_expiries.c.expiry_date.asc())
            .limit(8)
        )
    ).all()

    assignment_count = active_vehicle_assignment_count()
    tracking_last_seen = func.coalesce(
        active_vehicle_tracking_last_seen(),
        Vehicle.last_recorded_at,
    )
    document_attention_count = (
        case((Vehicle.fitness_expiry_date <= document_warning_end, 1), else_=0)
        + case((Vehicle.tax_token_expiry_date <= document_warning_end, 1), else_=0)
        + case((Vehicle.insurance_expiry_date <= document_warning_end, 1), else_=0)
        + case((Vehicle.route_permit_expiry_date <= document_warning_end, 1), else_=0)
    )
    recent_vehicle_rows = (
        await session.execute(
            select(
                Vehicle.id,
                Vehicle.registration_number,
                Vehicle.registration_number_display,
                Vehicle.brand,
                Vehicle.model,
                Vehicle.vehicle_type,
                Vehicle.verification_status,
                case((assignment_count > 0, True), else_=False).label("active_tracking"),
                tracking_last_seen.label("tracking_last_seen_at"),
                case(
                    (
                        and_(
                            assignment_count > 0,
                            tracking_last_seen >= online_cutoff,
                        ),
                        True,
                    ),
                    else_=False,
                ).label("gps_online"),
                document_attention_count.label("document_attention_count"),
            )
            .where(Vehicle.owner_id == owner.id)
            .order_by(Vehicle.created_at.desc())
            .limit(5)
        )
    ).all()

    active_tracking_vehicles = int(counts.active_tracking_vehicles or 0)
    online_vehicles = int(counts.online_vehicles or 0)
    offline_vehicles = max(active_tracking_vehicles - online_vehicles, 0)
    expiring_documents = int(document_counts.expiring_documents or 0)
    expired_documents = int(document_counts.expired_documents or 0)

    actions: list[OwnerDashboardAction] = []
    if owner.verification_status in {
        OwnerVerificationStatus.CHANGES_REQUESTED,
        OwnerVerificationStatus.REJECTED,
    }:
        actions.append(
            OwnerDashboardAction(
                key="owner_profile_review",
                title="Update owner profile",
                description="Police review notes require updates to your owner information.",
                href="/owner/profile",
                severity="critical",
                count=1,
            )
        )
    if counts.pending_provider_requests:
        actions.append(
            OwnerDashboardAction(
                key="provider_requests",
                title="Review provider requests",
                description="Approve or reject VTS providers requesting access to your vehicles.",
                href="/owner/providers",
                severity="warning",
                count=int(counts.pending_provider_requests),
            )
        )
    if counts.vehicles_needing_attention:
        actions.append(
            OwnerDashboardAction(
                key="vehicle_review_notes",
                title="Vehicle records need attention",
                description="Review police notes for rejected, suspended, or change-requested vehicles.",
                href="/owner/vehicles",
                severity="critical",
                count=int(counts.vehicles_needing_attention),
            )
        )
    if counts.pending_vehicles:
        actions.append(
            OwnerDashboardAction(
                key="pending_vehicles",
                title="Vehicle verification in progress",
                description="Track draft, submitted, and under-review vehicle records.",
                href="/owner/vehicles",
                severity="info",
                count=int(counts.pending_vehicles),
            )
        )
    if expired_documents:
        actions.append(
            OwnerDashboardAction(
                key="expired_documents",
                title="Expired vehicle documents",
                description="Renew expired fitness, tax, insurance, or route permit documents.",
                href="/owner/vehicles",
                severity="critical",
                count=expired_documents,
            )
        )
    if expiring_documents:
        actions.append(
            OwnerDashboardAction(
                key="expiring_documents",
                title="Documents expiring within 30 days",
                description="Renew these documents before service or compliance is interrupted.",
                href="/owner/vehicles",
                severity="warning",
                count=expiring_documents,
            )
        )
    if offline_vehicles:
        actions.append(
            OwnerDashboardAction(
                key="gps_offline",
                title="GPS devices are offline",
                description="Check vehicles with active tracking that have not reported recently.",
                href="/owner/vehicles",
                severity="warning",
                count=offline_vehicles,
            )
        )

    document_alerts = [
        OwnerDashboardDocumentAlert(
            vehicle_id=row.vehicle_id,
            registration_number=row.registration_number,
            document_type=row.document_type,
            expiry_date=row.expiry_date,
            days_remaining=(row.expiry_date - today).days,
            status="expired" if row.expiry_date < today else "expiring",
        )
        for row in document_alert_rows
    ]

    return OwnerDashboardSummary(
        owner=OwnerDashboardOwnerSummary(
            id=owner.id,
            owner_code=owner.owner_code,
            owner_name=owner.name,
            verification_status=owner.verification_status,
            review_notes=owner.review_notes,
        ),
        stats=OwnerDashboardStats(
            vehicles=int(counts.vehicles or 0),
            verified_vehicles=int(counts.verified_vehicles or 0),
            pending_vehicles=int(counts.pending_vehicles or 0),
            vehicles_needing_attention=int(counts.vehicles_needing_attention or 0),
            online_vehicles=online_vehicles,
            offline_vehicles=offline_vehicles,
            active_tracking_vehicles=active_tracking_vehicles,
            active_providers=int(counts.active_providers or 0),
            pending_provider_requests=int(counts.pending_provider_requests or 0),
            expiring_documents=expiring_documents,
            expired_documents=expired_documents,
        ),
        actions=actions,
        document_alerts=document_alerts,
        recent_vehicles=[
            OwnerDashboardVehicleSummary.model_validate(row._mapping)
            for row in recent_vehicle_rows
        ],
    )
