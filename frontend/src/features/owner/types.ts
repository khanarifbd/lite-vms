import type {
  OwnerApplication,
  OwnerDocument,
  OwnerDocumentPayload,
  OwnerDocumentType,
  OwnerProviderLink,
  OwnerProviderLinkStatus,
  OwnerType,
  OwnerVerificationStatus,
} from "@/features/provider/owner-types"

export type {
  OwnerApplication,
  OwnerDocument,
  OwnerDocumentPayload,
  OwnerDocumentType,
  OwnerProviderLink,
  OwnerProviderLinkStatus,
  OwnerType,
  OwnerVerificationStatus,
}

export type OwnerProviderLinkPage = {
  items: OwnerProviderLink[]
  total: number
  offset: number
  limit: number
}

export type OwnerVehicleRegistryOwner = {
  id: string
  owner_code: string | null
  owner_name: string
}

export type OwnerVehicle = {
  id: string
  registration_number: string
  registration_number_display: string | null
  vehicle_type: string
  vehicle_category: string | null
  brand: string | null
  model: string | null
  manufacturing_year: number | null
  color: string | null
  owner: OwnerVehicleRegistryOwner
  verification_status: string
  status: string
  gps_online: boolean
  tracking_last_seen_at: string | null
  latest_speed_kph: number | null
  tracking_assignment_status: string | null
  tracking_provider_name: string | null
  current_driver_name: string | null
  document_status: "required" | "expired" | "expiring" | "valid"
  document_days_remaining: number | null
  missing_documents: string[]
  created_at: string
  updated_at: string
}

export type OwnerVehicleRegistryStats = {
  total: number
  verified: number
  online: number
  active_tracking: number
}

export type OwnerVehiclePage = {
  items: OwnerVehicle[]
  total: number
  offset: number
  limit: number
  stats: OwnerVehicleRegistryStats
  next_cursor: string | null
}

export type OwnerPortalData = {
  owner: OwnerApplication
  links: OwnerProviderLinkPage
  vehicles: OwnerVehiclePage
}

export type OwnerDashboardOwner = {
  id: string
  owner_code: string | null
  owner_name: string
  verification_status: OwnerVerificationStatus
  review_notes: string | null
}

export type OwnerDashboardStats = {
  vehicles: number
  verified_vehicles: number
  pending_vehicles: number
  vehicles_needing_attention: number
  online_vehicles: number
  offline_vehicles: number
  active_tracking_vehicles: number
  active_providers: number
  pending_provider_requests: number
  expiring_documents: number
  expired_documents: number
}

export type OwnerDashboardVehicle = {
  id: string
  registration_number: string
  registration_number_display: string | null
  brand: string | null
  model: string | null
  vehicle_type: string
  verification_status: string
  gps_online: boolean
  active_tracking: boolean
  tracking_last_seen_at: string | null
  document_attention_count: number
}

export type OwnerDashboardDocumentAlert = {
  vehicle_id: string
  registration_number: string
  document_type: string
  expiry_date: string
  days_remaining: number
  status: "expired" | "expiring"
}

export type OwnerDashboardAction = {
  key: string
  title: string
  description: string
  href: string
  severity: "critical" | "warning" | "info"
  count: number
}

export type OwnerDashboardData = {
  owner: OwnerDashboardOwner
  stats: OwnerDashboardStats
  actions: OwnerDashboardAction[]
  document_alerts: OwnerDashboardDocumentAlert[]
  recent_vehicles: OwnerDashboardVehicle[]
}

export type OwnerProfileUpdatePayload = {
  owner_name?: string
  phone?: string | null
  email?: string | null
  date_of_birth?: string | null
  father_name?: string | null
  mother_name?: string | null
  gender?: string | null
  present_address?: string | null
  permanent_address?: string | null
  division?: string | null
  upazila?: string | null
  postal_code?: string | null
  alternate_phone?: string | null
  company_type?: string | null
  incorporation_date?: string | null
  authorized_person_name?: string | null
  authorized_person_nid?: string | null
  authorized_person_designation?: string | null
  authorized_person_mobile?: string | null
  authorized_person_email?: string | null
  head_office_address?: string | null
  operating_address?: string | null
  trade_license_number?: string | null
  tin_number?: string | null
  bin_number?: string | null
  registered_address?: string
  district?: string
  website_url?: string | null
  declaration_accepted?: boolean
}

export type OwnerProviderVehicleScopeMode = "all" | "selected"

export type OwnerProviderDirectoryItem = {
  id: string
  code: string
  name: string
  trade_name: string | null
  district: string | null
  website_url: string | null
  support_phone: string | null
  support_email: string | null
  service_coverage: string[]
  integration_status: string | null
  status: string
  current_link_status: OwnerProviderLinkStatus | null
}

export type OwnerConnectionVehicle = {
  id: string
  registration_number: string
  registration_number_display: string | null
  brand: string | null
  model: string | null
  vehicle_type: string
  verification_status: string
  tracking_provider_id: string | null
  tracking_provider_name: string | null
  tracking_assignment_status: string | null
}

export type OwnerProviderConnection = {
  id: string
  provider_id: string
  provider_code: string
  provider_name: string
  provider_trade_name: string | null
  provider_district: string | null
  provider_support_phone: string | null
  provider_support_email: string | null
  status: OwnerProviderLinkStatus
  requested_by: "owner" | "provider"
  requested_at: string
  responded_at: string | null
  ended_at: string | null
  reason: string | null
  vehicle_scope_mode: OwnerProviderVehicleScopeMode
  selected_vehicle_ids: string[]
  managed_vehicle_count: number
  created_vehicle_count: number
  active_tracking_count: number
  created_at: string
  updated_at: string
}

export type OwnerProviderConnectionStats = {
  total_links: number
  active: number
  pending_owner_approval: number
  pending_provider_approval: number
  ended_or_rejected: number
  approved_providers: number
}

export type OwnerProviderConnectionWorkspace = {
  stats: OwnerProviderConnectionStats
  providers: OwnerProviderDirectoryItem[]
  connections: OwnerProviderConnection[]
  vehicles: OwnerConnectionVehicle[]
}


export type OwnerDriverConnection = {
  id: string
  driver_id: string
  driver_name: string
  organization_type: "vehicle_owner"
  organization_id: string
  organization_name: string
  status:
    | "pending_driver_approval"
    | "pending_organization_approval"
    | "active"
    | "rejected"
    | "suspended"
    | "ended"
  requested_by: "driver" | "vehicle_owner" | "vts_provider"
  requested_at: string
  responded_at: string | null
  ended_at: string | null
  reason: string | null
}

export type OwnerDriverLinkPage = {
  items: OwnerDriverConnection[]
  total: number
  offset: number
  limit: number
}

export type OwnerDriverAssignment = {
  id: string
  vehicle_id: string
  driver_id: string
  owner_id: string
  provider_id: string | null
  assigned_by_user_id: number
  valid_from: string
  valid_to: string | null
  status: "pending" | "active" | "ended" | "rejected"
  is_on_duty: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type OwnerDriverLookupResult = {
  exists: boolean
  driver_id: string | null
  driver_name: string | null
  masked_nid_reference: string | null
  masked_mobile: string | null
  masked_licence_number: string | null
  licence_type: string | null
  licence_expiry_date: string | null
  driver_verification_status: string | null
  licence_verification_status: string | null
  owner_link_status: OwnerDriverConnection["status"] | null
  provider_link_status: OwnerDriverConnection["status"] | null
  can_send_request: boolean
  next_action: string
}
