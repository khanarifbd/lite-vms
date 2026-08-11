export type ReviewVehicleSummary = {
  id: string
  registration_number: string
  registration_number_display: string | null
  vehicle_type: string
  vehicle_category: string | null
  brand: string | null
  model: string | null
  manufacturing_year: number | null
  color: string | null
  verification_status: string
  movement_state: string | null
  latest_speed_kph: number | null
  last_received_at: string | null
}

export type ReviewOwnerSummary = {
  id: string
  owner_code: string | null
  name: string
  owner_type: string
  phone: string | null
  email: string | null
  district: string | null
  verification_status: string
}

export type ReviewProviderSummary = {
  id: string
  code: string
  name: string
  trade_name: string | null
  phone: string | null
  email: string | null
  status: string
  integration_status: string | null
  last_telemetry_received_at: string | null
}

export type ReviewDeviceSummary = {
  id: string
  imei: string | null
  device_identifier: string
  manufacturer: string | null
  model: string | null
  protocol: string | null
  operational_status: string
  certification_status: string
  last_seen_at: string | null
  source_code: string | null
}

export type ReviewDriverContext = {
  id: string
  driver_code: string
  full_name: string
  phone: string
  email: string | null
  district: string
  photo_url: string | null
  verification_status: string
  account_status: string
  behaviour_score: number
  licence_number: string | null
  licence_type: string | null
  licence_expiry_date: string | null
  licence_status: string | null
  assignment_id: string | null
  duty_session_id: string | null
  was_on_duty: boolean
  resolution_source: string
}

export type ViolationReviewCandidate = {
  id: string
  vehicle_id: string
  driver_id: string | null
  telemetry_id: string
  rule_id: string | null
  policy_id: string | null
  review_organization_id: number | null
  violation_type: string
  status: string
  detected_value: number | null
  allowed_value: number | null
  latitude: number
  longitude: number
  detected_at: string
  evidence: Record<string, unknown> | null
  assigned_officer_id: string | null
  reviewed_by: string | null
  reviewed_by_user_id: number | null
  reviewed_at: string | null
  review_note: string | null
  case_number: string | null
  created_at: string
  updated_at: string
  vehicle_profile: ReviewVehicleSummary | null
  owner_profile: ReviewOwnerSummary | null
  provider_profile: ReviewProviderSummary | null
  device_profile: ReviewDeviceSummary | null
  responsible_organization_name: string | null
}
