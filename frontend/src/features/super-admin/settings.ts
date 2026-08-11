import "server-only"

import { authenticatedBackendFetch } from "@/lib/api/server"

export type ApprovalSettings = {
  provider_auto_approve: boolean
  owner_auto_approve: boolean
  vehicle_auto_approve: boolean
  driver_auto_approve: boolean
  provider_staff_auto_approve: boolean
  gps_assignment_auto_approve: boolean
  document_auto_verify: boolean
}

export type NotificationSettings = {
  provider_application_submitted: boolean
  owner_application_submitted: boolean
  vehicle_application_submitted: boolean
  approval_decision: boolean
  gps_offline_alert: boolean
  document_expiry_alert: boolean
  violation_alert: boolean
  gps_offline_minutes: number
  document_expiry_warning_days: number
}

export type MonitoringSettings = {
  live_map_refresh_seconds: number
}

export type SecuritySettings = {
  session_timeout_minutes: number
  maximum_failed_login_attempts: number
  account_lock_minutes: number
  require_password_change_for_new_staff: boolean
  require_verified_identifier_for_admin: boolean
}

export type DocumentRequirement = {
  code: string
  label: string
  entity_type: string
  required: boolean
  expiry_required: boolean
}

export type VehicleCategorySetting = {
  code: string
  label: string
  enabled: boolean
}

export type SystemSettings = {
  approval: ApprovalSettings
  notifications: NotificationSettings
  monitoring: MonitoringSettings
  security: SecuritySettings
  document_requirements: DocumentRequirement[]
  vehicle_categories: VehicleCategorySetting[]
  updated_at: string | null
}

export type AuditLogItem = {
  id: string
  action: string
  resource_type: string
  resource_public_id: string | null
  actor_name: string | null
  reason: string | null
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

export type AuditLogPage = {
  items: AuditLogItem[]
  total: number
  offset: number
  limit: number
}

export async function getSystemSettings() {
  return authenticatedBackendFetch<SystemSettings>("/admin/settings")
}

export async function getMonitoringSettings() {
  return authenticatedBackendFetch<MonitoringSettings>("/admin/settings/monitoring")
}

export async function getAuditLogs() {
  return authenticatedBackendFetch<AuditLogPage>("/admin/settings/audit-logs?limit=50")
}
