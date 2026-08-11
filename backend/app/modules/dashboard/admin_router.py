from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    DocumentStatus,
    DocumentType,
    OwnerVerificationStatus,
    ProviderStatus,
    TrackingAssignmentStatus,
    UserRole,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.audit.model import AuditLog
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.dashboard.admin_schema import (
    AdminCommandAlert,
    AdminCommandDashboard,
    AdminCommandStats,
    AdminRecentActivity,
)
from app.modules.documents.model import VehicleDocument
from app.modules.drivers.enums import DriverLicenceStatus, DriverVerificationStatus
from app.modules.drivers.model import Driver, DriverLicence
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.tracking.model import TrackingDevice, VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

ADMIN_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.POLICE_ADMIN,
    UserRole.POLICE_OFFICER,
)

VEHICLE_COMPLIANCE_DOCUMENT_TYPES = (
    DocumentType.REGISTRATION,
    DocumentType.FITNESS,
    DocumentType.TAX_TOKEN,
    DocumentType.INSURANCE,
    DocumentType.ROUTE_PERMIT,
)


def count_for(model: type, *conditions):
    return select(func.count()).select_from(model).where(*conditions).scalar_subquery()


def distinct_document_vehicle_count(*conditions):
    return func.count(
        func.distinct(
            case(
                (and_(*conditions), VehicleDocument.vehicle_id),
                else_=None,
            )
        )
    )


@router.get("/admin-command", response_model=AdminCommandDashboard)
async def admin_command_dashboard(
    _: Annotated[User, Depends(require_roles(*ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminCommandDashboard:
    now = datetime.now(UTC)
    today = date.today()
    warning_date = today + timedelta(days=30)
    online_cutoff = now - timedelta(minutes=5)

    active_assignment_vehicle_ids = (
        select(VehicleDeviceAssignment.vehicle_id)
        .where(
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.is_primary.is_(True),
        )
        .distinct()
        .subquery()
    )
    online_vehicle_ids = (
        select(VehicleDeviceAssignment.vehicle_id)
        .join(TrackingDevice, TrackingDevice.id == VehicleDeviceAssignment.device_id)
        .where(
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.is_primary.is_(True),
            TrackingDevice.last_seen_at >= online_cutoff,
        )
        .distinct()
        .subquery()
    )

    counts = (
        await session.execute(
            select(
                count_for(VTSProvider).label("providers_total"),
                count_for(VTSProvider, VTSProvider.status == ProviderStatus.APPROVED).label(
                    "providers_approved"
                ),
                count_for(
                    VTSProvider,
                    VTSProvider.status.in_([ProviderStatus.PENDING, ProviderStatus.UNDER_REVIEW]),
                ).label("providers_pending"),
                count_for(VehicleOwner).label("owners_total"),
                count_for(
                    VehicleOwner,
                    VehicleOwner.verification_status.in_(
                        [OwnerVerificationStatus.PENDING, OwnerVerificationStatus.UNDER_REVIEW]
                    ),
                ).label("owners_pending"),
                count_for(Vehicle).label("vehicles_total"),
                count_for(
                    Vehicle,
                    Vehicle.verification_status == VehicleVerificationStatus.VERIFIED,
                ).label("vehicles_verified"),
                count_for(
                    Vehicle,
                    Vehicle.verification_status.in_(
                        [
                            VehicleVerificationStatus.PENDING_VERIFICATION,
                            VehicleVerificationStatus.UNDER_REVIEW,
                        ]
                    ),
                ).label("vehicles_pending"),
                count_for(Driver).label("drivers_total"),
                count_for(
                    Driver,
                    Driver.verification_status == DriverVerificationStatus.VERIFIED,
                ).label("drivers_verified"),
                count_for(
                    Driver,
                    Driver.submitted_at.is_not(None),
                    Driver.verification_status.in_(
                        [DriverVerificationStatus.PENDING, DriverVerificationStatus.UNDER_REVIEW]
                    ),
                ).label("drivers_pending"),
                count_for(
                    DriverLicence,
                    DriverLicence.expiry_date >= today,
                    DriverLicence.expiry_date <= warning_date,
                    DriverLicence.verification_status.notin_(
                        [
                            DriverLicenceStatus.EXPIRED,
                            DriverLicenceStatus.REVOKED,
                            DriverLicenceStatus.REJECTED,
                        ]
                    ),
                ).label("driver_licences_expiring"),
                count_for(
                    DriverLicence,
                    or_(
                        DriverLicence.expiry_date < today,
                        DriverLicence.verification_status == DriverLicenceStatus.EXPIRED,
                    ),
                ).label("driver_licences_expired"),
                select(func.count()).select_from(online_vehicle_ids).scalar_subquery().label(
                    "gps_online"
                ),
                select(func.count())
                .select_from(active_assignment_vehicle_ids)
                .scalar_subquery()
                .label("active_tracking"),
                count_for(
                    VehicleDocument,
                    VehicleDocument.status == DocumentStatus.PENDING_VERIFICATION,
                ).label("pending_document_reviews"),
                (
                    count_for(
                        VehicleOwner,
                        VehicleOwner.verification_status
                        == OwnerVerificationStatus.CHANGES_REQUESTED,
                    )
                    + count_for(
                        Vehicle,
                        Vehicle.verification_status
                        == VehicleVerificationStatus.CHANGES_REQUESTED,
                    )
                    + count_for(
                        Driver,
                        Driver.verification_status == DriverVerificationStatus.CHANGES_REQUESTED,
                    )
                ).label("changes_requested"),
                (
                    count_for(VTSProvider, VTSProvider.status == ProviderStatus.REJECTED)
                    + count_for(
                        VehicleOwner,
                        VehicleOwner.verification_status == OwnerVerificationStatus.REJECTED,
                    )
                    + count_for(
                        Vehicle,
                        Vehicle.verification_status == VehicleVerificationStatus.REJECTED,
                    )
                    + count_for(
                        Driver,
                        Driver.verification_status == DriverVerificationStatus.REJECTED,
                    )
                ).label("rejected_records"),
            )
        )
    ).one()

    expired_document = or_(
        VehicleDocument.expires_at < today,
        VehicleDocument.status == DocumentStatus.EXPIRED,
    )
    expiring_document = and_(
        VehicleDocument.expires_at >= today,
        VehicleDocument.expires_at <= warning_date,
        VehicleDocument.status.notin_([DocumentStatus.EXPIRED, DocumentStatus.REVOKED]),
    )

    document_counts = (
        await session.execute(
            select(
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.REGISTRATION,
                    expiring_document,
                ).label("registration_documents_expiring"),
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.REGISTRATION,
                    expired_document,
                ).label("registration_documents_expired"),
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.FITNESS,
                    expiring_document,
                ).label("fitness_documents_expiring"),
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.FITNESS,
                    expired_document,
                ).label("fitness_documents_expired"),
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.TAX_TOKEN,
                    expiring_document,
                ).label("tax_tokens_expiring"),
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.TAX_TOKEN,
                    expired_document,
                ).label("tax_tokens_expired"),
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.INSURANCE,
                    expiring_document,
                ).label("insurance_documents_expiring"),
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.INSURANCE,
                    expired_document,
                ).label("insurance_documents_expired"),
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.ROUTE_PERMIT,
                    expiring_document,
                ).label("route_permits_expiring"),
                distinct_document_vehicle_count(
                    VehicleDocument.document_type == DocumentType.ROUTE_PERMIT,
                    expired_document,
                ).label("route_permits_expired"),
                distinct_document_vehicle_count(expiring_document).label(
                    "vehicles_with_expiring_documents"
                ),
                distinct_document_vehicle_count(expired_document).label(
                    "vehicles_with_expired_documents"
                ),
            ).where(
                VehicleDocument.is_active.is_(True),
                VehicleDocument.status.notin_(
                    [
                        DocumentStatus.PENDING_VERIFICATION,
                        DocumentStatus.REVOKED,
                    ]
                ),
                VehicleDocument.document_type.in_(VEHICLE_COMPLIANCE_DOCUMENT_TYPES),
            )
        )
    ).one()

    gps_offline = max(0, counts.active_tracking - counts.gps_online)
    stats = AdminCommandStats(
        providers_total=counts.providers_total,
        providers_approved=counts.providers_approved,
        providers_pending=counts.providers_pending,
        owners_total=counts.owners_total,
        owners_pending=counts.owners_pending,
        vehicles_total=counts.vehicles_total,
        vehicles_verified=counts.vehicles_verified,
        vehicles_pending=counts.vehicles_pending,
        drivers_total=counts.drivers_total,
        drivers_verified=counts.drivers_verified,
        drivers_pending=counts.drivers_pending,
        driver_licences_expiring=counts.driver_licences_expiring,
        driver_licences_expired=counts.driver_licences_expired,
        registration_documents_expiring=document_counts.registration_documents_expiring,
        registration_documents_expired=document_counts.registration_documents_expired,
        fitness_documents_expiring=document_counts.fitness_documents_expiring,
        fitness_documents_expired=document_counts.fitness_documents_expired,
        tax_tokens_expiring=document_counts.tax_tokens_expiring,
        tax_tokens_expired=document_counts.tax_tokens_expired,
        insurance_documents_expiring=document_counts.insurance_documents_expiring,
        insurance_documents_expired=document_counts.insurance_documents_expired,
        route_permits_expiring=document_counts.route_permits_expiring,
        route_permits_expired=document_counts.route_permits_expired,
        vehicles_with_expiring_documents=document_counts.vehicles_with_expiring_documents,
        vehicles_with_expired_documents=document_counts.vehicles_with_expired_documents,
        gps_online=counts.gps_online,
        gps_offline=gps_offline,
        active_tracking=counts.active_tracking,
        pending_document_reviews=counts.pending_document_reviews,
        changes_requested=counts.changes_requested,
        rejected_records=counts.rejected_records,
    )

    alerts = [
        AdminCommandAlert(
            key="provider-review",
            title="VTS provider applications require review",
            description="Review pending and under-review provider applications.",
            severity="warning" if stats.providers_pending else "info",
            count=stats.providers_pending,
            href="/super-admin/approvals?entity=provider",
        ),
        AdminCommandAlert(
            key="owner-review",
            title="Vehicle-owner applications require review",
            description="Check individual and company owner applications and documents.",
            severity="warning" if stats.owners_pending else "info",
            count=stats.owners_pending,
            href="/super-admin/approvals?entity=owner",
        ),
        AdminCommandAlert(
            key="vehicle-review",
            title="Vehicle registrations require review",
            description="Validate vehicle identity, compliance, and police verification state.",
            severity="warning" if stats.vehicles_pending else "info",
            count=stats.vehicles_pending,
            href="/super-admin/approvals?entity=vehicle",
        ),
        AdminCommandAlert(
            key="driver-review",
            title="Driver applications require review",
            description="Verify driver identity, BRTA licence, vehicle classes, and documents.",
            severity="warning" if stats.drivers_pending else "info",
            count=stats.drivers_pending,
            href="/super-admin/approvals?entity=driver",
        ),
        AdminCommandAlert(
            key="driver-licence-expired",
            title="Driver licences are expired",
            description="Review drivers whose BRTA licence is expired or marked expired.",
            severity="critical" if stats.driver_licences_expired else "info",
            count=stats.driver_licences_expired,
            href="/super-admin/approvals?entity=driver",
        ),
        AdminCommandAlert(
            key="driver-licence-expiring",
            title="Driver licences expire within 30 days",
            description="Follow up before verified drivers become ineligible for assignment.",
            severity="warning" if stats.driver_licences_expiring else "info",
            count=stats.driver_licences_expiring,
            href="/super-admin/approvals?entity=driver",
        ),
        AdminCommandAlert(
            key="vehicle-documents-expired",
            title="Vehicles have expired compliance documents",
            description=(
                "Registration, fitness, tax token, insurance, and route permit "
                "documents are monitored."
            ),
            severity="critical" if stats.vehicles_with_expired_documents else "info",
            count=stats.vehicles_with_expired_documents,
            href="/super-admin/approvals?entity=document&status=expired",
        ),
        AdminCommandAlert(
            key="vehicle-documents-expiring",
            title="Vehicle documents expire within 30 days",
            description=(
                "Follow up on registration, fitness, tax token, insurance, and "
                "route permit documents before expiry."
            ),
            severity="warning" if stats.vehicles_with_expiring_documents else "info",
            count=stats.vehicles_with_expiring_documents,
            href="/super-admin/approvals?entity=document&status=expiring_soon",
        ),
        AdminCommandAlert(
            key="document-review",
            title="Vehicle documents await verification",
            description="Review pending registration, fitness, tax, insurance, and permit documents.",
            severity="warning" if stats.pending_document_reviews else "info",
            count=stats.pending_document_reviews,
            href="/super-admin/approvals?entity=document&status=pending",
        ),
        AdminCommandAlert(
            key="gps-offline",
            title="Active tracking vehicles are offline",
            description="Investigate active GPS assignments without a recent signal.",
            severity="critical" if stats.gps_offline else "info",
            count=stats.gps_offline,
            href="/super-admin/dashboard#gps-health",
        ),
        AdminCommandAlert(
            key="corrections",
            title="Records are waiting for corrections",
            description="Monitor changes-requested and rejected registrations.",
            severity="warning" if stats.changes_requested or stats.rejected_records else "info",
            count=stats.changes_requested + stats.rejected_records,
            href="/super-admin/approvals",
        ),
    ]

    actor_name = (
        select(User.display_name)
        .where(User.id == AuditLog.actor_user_id)
        .correlate(AuditLog)
        .scalar_subquery()
    )
    activity_rows = (
        await session.execute(
            select(
                AuditLog.public_id.label("id"),
                AuditLog.action,
                AuditLog.resource_type,
                AuditLog.resource_public_id,
                actor_name.label("actor_name"),
                AuditLog.reason,
                AuditLog.created_at,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(12)
        )
    ).all()

    return AdminCommandDashboard(
        stats=stats,
        alerts=alerts,
        recent_activity=[
            AdminRecentActivity.model_validate(row._mapping) for row in activity_rows
        ],
    )
