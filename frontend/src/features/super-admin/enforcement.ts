import "server-only"

import { authenticatedBackendFetch } from "@/lib/api/server"

export type ViolationType = "overspeed" | "route_violation" | "geofence_violation" | "document_expired"
export type EnforcementAreaType = "national" | "polygon" | "circle" | "road_corridor"
export type SpeedRuleVehicleScope = "all" | "exclude_selected" | "include_selected"

export type EnforcementDashboardSummary = {
  rules_total: number
  rules_active: number
  rules_inactive: number
  national_rules: number
  map_based_rules: number
  geofences_total: number
  geofences_active: number
  policies_total: number
  policies_active: number
  jurisdictions_total: number
  jurisdictions_active: number
  exemptions_total: number
  exemptions_active: number
  exemptions_expiring_soon: number
  candidates_pending_review: number
  cases_open: number
  configuration_changes_24h: number
  generated_at: string
}

export type EnforcementPolicy = {
  id: string
  name: string
  violation_type: ViolationType
  scope: string
  severity: string
  minimum_duration_seconds: number
  minimum_consecutive_packets: number
  cooldown_seconds: number
  acceptable_packet_delay_seconds: number
  review_required: boolean
  auto_create_candidate: boolean
  auto_create_case: boolean
  enabled: boolean
  effective_from: string | null
  effective_to: string | null
  legal_reference: string | null
  notes: string | null
}

export type PoliceOrganization = {
  id: number
  public_id: string
  name_en: string
  name_bn: string | null
  organization_type: string
}

export type EnforcementGeofence = {
  id: string
  name: string
  description: string | null
  geometry: Record<string, unknown>
  enabled: boolean
  created_by_user_id: number | null
  created_at: string
  updated_at: string
}

export type EnforcementJurisdiction = {
  id: string
  organization_id: number
  name: string
  area_type: EnforcementAreaType
  geometry: Record<string, unknown> | null
  priority: number
  enabled: boolean
}

export type SpeedRule = {
  id: string
  name: string
  policy_id: string
  geofence_id: string | null
  jurisdiction_id: string | null
  review_organization_id: number | null
  area_type: EnforcementAreaType
  geometry: Record<string, unknown> | null
  maximum_speed_kph: number
  tolerance_kph: number
  vehicle_scope: SpeedRuleVehicleScope
  vehicle_ids: string[] | null
  vehicle_categories: string[] | null
  active_days: number[] | null
  active_start_time: string | null
  active_end_time: string | null
  priority: number
  enabled: boolean
  effective_from: string | null
  effective_to: string | null
}

export type ViolationCandidate = {
  id: string
  vehicle_id: string
  driver_id: string | null
  telemetry_id: string
  rule_id: string | null
  policy_id: string | null
  review_organization_id: number | null
  violation_type: ViolationType
  status: string
  detected_value: number | null
  allowed_value: number | null
  latitude: number
  longitude: number
  detected_at: string
  evidence: Record<string, unknown> | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  case_number: string | null
}

export type EnforcementCase = {
  id: string
  case_number: string
  candidate_id: string
  organization_id: number
  status: string
  opened_by_user_id: number | null
  opened_at: string
  closed_at: string | null
  notes: string | null
}

export type VehicleExemption = {
  id: string
  vehicle_id: string
  violation_type: ViolationType | null
  reason: string
  reference_number: string | null
  valid_from: string
  valid_to: string | null
  enabled: boolean
  note: string | null
}

export type EnforcementConfiguration = {
  policies: EnforcementPolicy[]
  policeOrganizations?: PoliceOrganization[]
  geofences?: EnforcementGeofence[]
  jurisdictions: EnforcementJurisdiction[]
  speedRules: SpeedRule[]
  exemptions: VehicleExemption[]
}

export async function getEnforcementDashboardSummary() {
  return authenticatedBackendFetch<EnforcementDashboardSummary>(
    "/admin/enforcement/dashboard-summary"
  )
}

export async function getEnforcementConfiguration(): Promise<EnforcementConfiguration> {
  const [policies, policeOrganizations, geofences, jurisdictions, speedRules, exemptions] = await Promise.all([
    authenticatedBackendFetch<EnforcementPolicy[]>("/admin/enforcement/policies"),
    authenticatedBackendFetch<PoliceOrganization[]>("/admin/enforcement/police-organizations"),
    authenticatedBackendFetch<EnforcementGeofence[]>("/admin/enforcement/geofences"),
    authenticatedBackendFetch<EnforcementJurisdiction[]>("/admin/enforcement/jurisdictions"),
    authenticatedBackendFetch<SpeedRule[]>("/admin/enforcement/rules"),
    authenticatedBackendFetch<VehicleExemption[]>("/admin/enforcement/vehicle-exemptions"),
  ])
  return { policies, policeOrganizations, geofences, jurisdictions, speedRules, exemptions }
}

export async function getEnforcementGeofences() {
  return authenticatedBackendFetch<EnforcementGeofence[]>("/admin/enforcement/geofences")
}

export async function getViolationReviewQueue(status = "pending_review") {
  return authenticatedBackendFetch<ViolationCandidate[]>(
    `/admin/enforcement/review-queue?status=${encodeURIComponent(status)}`
  )
}

export async function getEnforcementCases(status?: string) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : ""
  return authenticatedBackendFetch<EnforcementCase[]>(
    `/admin/enforcement/national/cases${suffix}`
  )
}
