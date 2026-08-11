from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ApprovalAutomationSettings(BaseModel):
    provider_auto_approve: bool = False
    owner_auto_approve: bool = False
    vehicle_auto_approve: bool = False
    driver_auto_approve: bool = False
    provider_staff_auto_approve: bool = False
    gps_assignment_auto_approve: bool = False
    document_auto_verify: bool = False


class NotificationRuleSettings(BaseModel):
    provider_application_submitted: bool = True
    owner_application_submitted: bool = True
    vehicle_application_submitted: bool = True
    approval_decision: bool = True
    gps_offline_alert: bool = True
    document_expiry_alert: bool = True
    violation_alert: bool = True
    gps_offline_minutes: int = Field(default=5, ge=1, le=1440)
    document_expiry_warning_days: int = Field(default=30, ge=1, le=365)


class MonitoringSettings(BaseModel):
    live_map_refresh_seconds: int = Field(default=30, ge=15, le=3600)


class SecuritySettings(BaseModel):
    session_timeout_minutes: int = Field(default=720, ge=15, le=10080)
    maximum_failed_login_attempts: int = Field(default=5, ge=3, le=20)
    account_lock_minutes: int = Field(default=30, ge=5, le=1440)
    require_password_change_for_new_staff: bool = True
    require_verified_identifier_for_admin: bool = True


class DocumentRequirement(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    label: str = Field(min_length=2, max_length=180)
    entity_type: str = Field(min_length=2, max_length=40)
    required: bool = True
    expiry_required: bool = False


class VehicleCategorySetting(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    label: str = Field(min_length=2, max_length=180)
    enabled: bool = True


class SystemSettingsRead(BaseModel):
    approval: ApprovalAutomationSettings
    notifications: NotificationRuleSettings
    monitoring: MonitoringSettings
    security: SecuritySettings
    document_requirements: list[DocumentRequirement]
    vehicle_categories: list[VehicleCategorySetting]
    updated_at: datetime | None = None


class SystemSettingsUpdate(BaseModel):
    approval: ApprovalAutomationSettings
    notifications: NotificationRuleSettings
    monitoring: MonitoringSettings
    security: SecuritySettings
    document_requirements: list[DocumentRequirement]
    vehicle_categories: list[VehicleCategorySetting]
    reason: str = Field(min_length=3, max_length=1000)


class AuditLogItem(BaseModel):
    id: str
    action: str
    resource_type: str
    resource_public_id: str | None
    actor_name: str | None
    reason: str | None
    previous_values: dict[str, Any] | None
    new_values: dict[str, Any] | None
    created_at: datetime


class AuditLogPage(BaseModel):
    items: list[AuditLogItem]
    total: int
    offset: int
    limit: int
