export type PaginatedResponse<T> = {
  items: T[]
  total: number
  offset: number
  limit: number
}

export type ProviderSummary = {
  id: string
  application_number: string
  code: string
  legal_name: string
  district: string
  status: string
  integration_status: string | null
  estimated_vehicle_count: number
  active_vehicle_count: number
  online_vehicle_count: number
  submitted_at: string
}

export type OwnerSummary = {
  id: string
  application_number: string
  owner_code: string
  owner_type: string
  name: string
  district: string | null
  verification_status: string
  submitted_at: string
}

export type VehicleSummary = {
  id: string
  registration_number: string
  registration_number_display: string | null
  brand: string | null
  model: string | null
  vehicle_type: string
  verification_status: string
  created_at: string
}

export type RecentUserSummary = {
  public_id: string
  display_name: string
  status: string
  primary_identifier: string | null
  primary_role: string | null
  created_at: string
}

export type RecentProviderSummary = {
  id: string
  application_number: string | null
  code: string
  legal_name: string
  district: string | null
  status: string
  submitted_at: string | null
}

export type SuperAdminDashboardData = {
  totals: {
    users: number
    activeUsers: number
    providers: number
    approvedProviders: number
    owners: number
    vehicles: number
  }
  pending: {
    providers: number
    owners: number
    vehicles: number
  }
  recentUsers: RecentUserSummary[]
  recentProviders: RecentProviderSummary[]
  warnings: string[]
}

type BackendSuperAdminDashboard = {
  totals: {
    users: number
    active_users: number
    providers: number
    approved_providers: number
    owners: number
    vehicles: number
  }
  pending: {
    providers: number
    owners: number
    vehicles: number
  }
  recent_users: RecentUserSummary[]
  recent_providers: RecentProviderSummary[]
}

export type AdminCommandStats = {
  providers_total: number
  providers_approved: number
  providers_pending: number
  owners_total: number
  owners_pending: number
  vehicles_total: number
  vehicles_verified: number
  vehicles_pending: number
  drivers_total: number
  drivers_verified: number
  drivers_pending: number
  driver_licences_expiring: number
  driver_licences_expired: number
  registration_documents_expiring: number
  registration_documents_expired: number
  fitness_documents_expiring: number
  fitness_documents_expired: number
  tax_tokens_expiring: number
  tax_tokens_expired: number
  insurance_documents_expiring: number
  insurance_documents_expired: number
  route_permits_expiring: number
  route_permits_expired: number
  vehicles_with_expiring_documents: number
  vehicles_with_expired_documents: number
  gps_online: number
  gps_offline: number
  active_tracking: number
  pending_document_reviews: number
  changes_requested: number
  rejected_records: number
}

export type AdminCommandAlert = {
  key: string
  title: string
  description: string
  severity: "critical" | "warning" | "info"
  count: number
  href: string
}

export type AdminRecentActivity = {
  id: string
  action: string
  resource_type: string
  resource_public_id: string | null
  actor_name: string | null
  reason: string | null
  created_at: string
}

export type AdminCommandDashboardData = {
  stats: AdminCommandStats
  alerts: AdminCommandAlert[]
  recent_activity: AdminRecentActivity[]
}

export type { BackendSuperAdminDashboard }
