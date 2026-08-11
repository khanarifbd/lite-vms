import "server-only"

import { authenticatedBackendFetch } from "@/lib/api/server"

export type AdminProviderDocument = {
  id: string
  document_type: string
  document_number: string | null
  storage_key: string
  file_name: string | null
  content_type: string | null
  size_bytes: number | null
  expires_at: string | null
  status: string
  version: number
  is_active: boolean
  replaced_by_id: string | null
  verified_at: string | null
  review_notes: string | null
}

export type AdminProvider = {
  id: string
  application_number: string
  code: string
  legal_name: string
  trade_name: string | null
  company_type: string | null
  incorporation_date: string | null
  btrc_license_number: string
  btrc_license_issue_date: string | null
  btrc_license_expiry_date: string | null
  trade_license_number: string
  trade_license_expiry_date: string | null
  company_registration_number: string | null
  tin_number: string | null
  bin_number: string | null
  registered_address: string
  district: string
  website_url: string | null
  authorized_representative_name: string | null
  authorized_representative_nid: string | null
  authorized_representative_designation: string | null
  authorized_representative_mobile: string | null
  authorized_representative_email: string | null
  contact_person: string
  phone: string
  email: string
  technical_contact_name: string
  technical_contact_phone: string
  technical_contact_email: string
  operations_contact_name: string | null
  operations_contact_phone: string | null
  operations_contact_email: string | null
  support_contact_name: string | null
  support_contact_phone: string | null
  support_contact_email: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_email: string | null
  service_coverage: string[]
  supported_protocols: string[]
  supported_device_brands: string[]
  api_base_url: string | null
  estimated_vehicle_count: number
  current_platform_name: string | null
  data_submission_interval_seconds: number | null
  integration_status: string | null
  last_telemetry_received_at: string | null
  allowed_server_ips: string[]
  documents: AdminProviderDocument[]
  linked_owner_count: number
  registered_device_count: number
  active_vehicle_count: number
  online_vehicle_count: number
  telemetry_source_id: string | null
  telemetry_source_code: string | null
  telemetry_source_status: string | null
  provider_staff_count: number
  declaration_accepted: boolean
  submitted_at: string
  reviewed_at: string | null
  review_notes: string | null
  status: string
  created_at: string
  updated_at: string
}

export type AdminAccountHistoryEntry = {
  id: string
  action: string
  actor_name: string | null
  reason: string | null
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

export type AdminProviderDetail = {
  provider: AdminProvider
  account_status: string
  last_administrative_reason: string | null
  history: AdminAccountHistoryEntry[]
}

export type AdminProviderPage = {
  items: AdminProvider[]
  total: number
  offset: number
  limit: number
}

export async function getAdminProviders(params: {
  search?: string
  status?: string
  offset?: number
  limit?: number
}) {
  const search = new URLSearchParams()
  if (params.search) search.set("search", params.search)
  if (params.status) search.set("status", params.status)
  search.set("offset", String(params.offset || 0))
  search.set("limit", String(params.limit || 25))
  return authenticatedBackendFetch<AdminProviderPage>(`/admin/providers?${search.toString()}`)
}

export async function getAdminProvider(providerId: string) {
  return authenticatedBackendFetch<AdminProviderDetail>(`/admin/providers/${providerId}/account-detail`)
}
