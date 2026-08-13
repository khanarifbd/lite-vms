from fastapi import APIRouter, Depends

from app.common.enums import UserRole
from app.core.config import settings
from app.modules.approvals.cursor_router import router as approval_cursor_router
from app.modules.approvals.document_router import router as approval_document_router
from app.modules.assignments.owner_vehicle_router import router as owner_vehicle_driver_router
from app.modules.assignments.provider_unassign_router import router as provider_unassign_router
from app.modules.assignments.provider_vehicle_router import router as provider_vehicle_driver_router
from app.modules.assignments.router import router as assignments_router
from app.modules.auth.admin_password_reset_router import router as admin_password_reset_router
from app.modules.auth.dependencies import require_roles
from app.modules.auth.identifier_availability_router import router as identifier_availability_router
from app.modules.auth.identifier_router import router as identifier_router
from app.modules.auth.router import router as auth_router
from app.modules.dashboard.admin_router import router as admin_dashboard_router
from app.modules.dashboard.monitoring_playback_router import router as admin_monitoring_playback_router
from app.modules.dashboard.monitoring_router import router as admin_monitoring_router
from app.modules.dashboard.monitoring_vehicle_router import router as admin_monitoring_vehicle_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.documents.router import router as documents_router
from app.modules.drivers.admin_router import router as admin_driver_router
from app.modules.drivers.application_router import router as driver_application_router
from app.modules.drivers.connection_router import router as driver_connection_router
from app.modules.drivers.owner_link_router import router as owner_driver_link_router
from app.modules.drivers.public_registration_router import router as driver_public_registration_router
from app.modules.drivers.recovery_router import router as driver_recovery_router
from app.modules.drivers.router import router as drivers_router
from app.modules.enforcement.dashboard_router import router as enforcement_dashboard_router
from app.modules.enforcement.incident_trip_history_router import router as enforcement_incident_trip_history_router
from app.modules.enforcement.review_driver_router import router as enforcement_review_driver_router
from app.modules.enforcement.router import router as enforcement_router
from app.modules.enforcement.rule_delete_router import router as enforcement_rule_delete_router
from app.modules.enforcement.super_admin_cases_router import router as enforcement_super_admin_cases_router
from app.modules.enforcement.super_admin_review_router import router as enforcement_super_admin_review_router
from app.modules.enforcement.vehicle_picker_router import router as enforcement_vehicle_picker_router
from app.modules.iam.admin_organization_router import router as admin_organization_router
from app.modules.iam.admin_staff_router import router as admin_staff_router
from app.modules.iam.router import router as iam_router
from app.modules.owners.admin_router import router as admin_owner_router
from app.modules.owners.connection_router import router as owner_connection_router
from app.modules.owners.mobile_registration_router import router as owner_mobile_registration_router
from app.modules.owners.profile_router import router as owner_profile_router
from app.modules.owners.provider_customer_router import router as provider_customer_router
from app.modules.owners.public_registration_router import router as owner_public_registration_router
from app.modules.owners.recovery_router import router as owner_recovery_router
from app.modules.owners.router import router as owners_router
from app.modules.providers.admin_router import router as admin_provider_router
from app.modules.providers.api_key_router import router as provider_api_key_router
from app.modules.providers.router import router as providers_router
from app.modules.providers.staff_router import router as provider_staff_router
from app.modules.providers.workspace_router import router as provider_workspace_router
from app.modules.qr_verification.public_router import router as public_qr_router
from app.modules.qr_verification.router import router as qr_router
from app.modules.settings.auto_approval_dependencies import (
    apply_driver_auto_approval_after_request,
    apply_owner_auto_approval_after_request,
    apply_vehicle_auto_approval_after_request,
)
from app.modules.settings.router import router as admin_settings_router
from app.modules.settings.vehicle_options_router import router as vehicle_options_router
from app.modules.telemetry.router import router as telemetry_router
from app.modules.tracking.provider_device_router import router as provider_device_router
from app.modules.tracking.router import router as tracking_router
from app.modules.uploads.router import router as uploads_router
from app.modules.vehicles.admin_router import router as admin_vehicle_router
from app.modules.vehicles.gomax_import_router import router as gomax_import_router
from app.modules.vehicles.owner_document_router import router as owner_vehicle_document_router
from app.modules.vehicles.owner_registration_router import router as owner_vehicle_registration_router
from app.modules.vehicles.provider_document_router import router as provider_vehicle_document_router
from app.modules.vehicles.provider_registration_router import router as provider_vehicle_registration_router
from app.modules.vehicles.registry_router import router as vehicle_registry_router
from app.modules.vehicles.router import router as vehicles_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(admin_password_reset_router)
api_router.include_router(identifier_availability_router)
api_router.include_router(identifier_router)
api_router.include_router(iam_router)
api_router.include_router(admin_organization_router)
api_router.include_router(admin_staff_router)
api_router.include_router(admin_dashboard_router)
api_router.include_router(admin_monitoring_router)
api_router.include_router(admin_monitoring_vehicle_router)
api_router.include_router(admin_monitoring_playback_router)
api_router.include_router(admin_settings_router)
api_router.include_router(vehicle_options_router)
api_router.include_router(approval_cursor_router)
api_router.include_router(approval_document_router)
api_router.include_router(enforcement_router)
api_router.include_router(enforcement_dashboard_router)
api_router.include_router(enforcement_super_admin_review_router)
api_router.include_router(enforcement_review_driver_router)
api_router.include_router(enforcement_incident_trip_history_router)
api_router.include_router(enforcement_super_admin_cases_router)
api_router.include_router(enforcement_rule_delete_router)
api_router.include_router(enforcement_vehicle_picker_router)
api_router.include_router(dashboard_router)
api_router.include_router(admin_provider_router)
api_router.include_router(admin_owner_router)
api_router.include_router(admin_vehicle_router)
api_router.include_router(provider_staff_router)
api_router.include_router(provider_customer_router)
api_router.include_router(provider_workspace_router)
api_router.include_router(provider_api_key_router)
api_router.include_router(providers_router)
api_router.include_router(public_qr_router)

api_router.include_router(owner_profile_router, dependencies=[Depends(apply_owner_auto_approval_after_request)])
api_router.include_router(owner_connection_router)
api_router.include_router(owner_public_registration_router)
api_router.include_router(owner_mobile_registration_router)
api_router.include_router(owners_router)
api_router.include_router(owner_recovery_router)
api_router.include_router(vehicle_registry_router)
api_router.include_router(provider_vehicle_document_router, dependencies=[Depends(apply_vehicle_auto_approval_after_request)])
api_router.include_router(owner_vehicle_document_router, dependencies=[Depends(apply_vehicle_auto_approval_after_request)])
api_router.include_router(provider_device_router)
api_router.include_router(provider_vehicle_driver_router)
api_router.include_router(owner_vehicle_driver_router)
api_router.include_router(provider_unassign_router)
api_router.include_router(gomax_import_router)
api_router.include_router(provider_vehicle_registration_router, dependencies=[Depends(apply_vehicle_auto_approval_after_request)])
api_router.include_router(owner_vehicle_registration_router, dependencies=[Depends(apply_vehicle_auto_approval_after_request)])
api_router.include_router(vehicles_router)
api_router.include_router(tracking_router)
api_router.include_router(driver_connection_router)
api_router.include_router(owner_driver_link_router)
api_router.include_router(driver_public_registration_router)
api_router.include_router(driver_application_router, dependencies=[Depends(apply_driver_auto_approval_after_request)])
api_router.include_router(admin_driver_router)
api_router.include_router(drivers_router)
api_router.include_router(driver_recovery_router)
api_router.include_router(assignments_router)
api_router.include_router(uploads_router)

registry_roles = (
    UserRole.SUPER_ADMIN,
    UserRole.POLICE_ADMIN,
    UserRole.POLICE_OFFICER,
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VTS_TECHNICAL,
    UserRole.VTS_VIEWER,
    UserRole.VEHICLE_OWNER,
    UserRole.DRIVER,
)
registry_access = [Depends(require_roles(*registry_roles))]

api_router.include_router(documents_router, dependencies=registry_access)
if settings.telemetry_enabled:
    api_router.include_router(telemetry_router)
api_router.include_router(qr_router, dependencies=registry_access)
