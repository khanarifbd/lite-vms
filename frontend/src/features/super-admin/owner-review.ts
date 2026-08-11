import "server-only"

import { authenticatedBackendFetch } from "@/lib/api/server"

export type AdminOwnerDocument = {
  id: string
  document_type: string
  document_reference: string | null
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

export type AdminOwnerProvider = {
  provider_id: string
  provider_code: string
  provider_name: string
  status: string
}

export type AdminOwner = {
  id: string
  application_number: string
  owner_code: string
  tenant_public_id: string
  organization_public_id: string
  primary_admin_user_public_id: string | null
  created_by_provider_id: string | null
  created_by_provider_name: string | null
  owner_type: "individual" | "company"
  owner_name: string
  identity_or_registration_reference: string
  claim_status: string
  date_of_birth: string | null
  father_name: string | null
  mother_name: string | null
  gender: string | null
  profile_photo_storage_key: string | null
  present_address: string | null
  permanent_address: string | null
  division: string | null
  upazila: string | null
  postal_code: string | null
  alternate_phone: string | null
  company_type: string | null
  incorporation_date: string | null
  authorized_person_name: string | null
  authorized_person_nid: string | null
  authorized_person_designation: string | null
  authorized_person_mobile: string | null
  authorized_person_email: string | null
  company_logo_storage_key: string | null
  head_office_address: string | null
  operating_address: string | null
  trade_license_number: string | null
  tin_number: string | null
  bin_number: string | null
  phone: string | null
  email: string | null
  account_username: string | null
  account_status: string | null
  registered_address: string
  district: string
  website_url: string | null
  documents: AdminOwnerDocument[]
  linked_providers: AdminOwnerProvider[]
  total_vehicles: number
  active_vehicles: number
  linked_drivers_count: number
  active_vts_providers_count: number
  primary_vts_provider: AdminOwnerProvider | null
  declaration_accepted: boolean
  submitted_at: string | null
  reviewed_at: string | null
  review_notes: string | null
  verification_status: string
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

export type AdminOwnerVehicle = {
  id: string
  registration_number: string
  registration_number_display: string | null
  vehicle_type: string
  brand: string | null
  model: string | null
  verification_status: string
  status: string
  latest_speed_kph: number | null
  last_recorded_at: string | null
}

export type AdminOwnerDetail = {
  owner: AdminOwner
  vehicles: AdminOwnerVehicle[]
  account_status: string | null
  last_administrative_reason: string | null
  history: AdminAccountHistoryEntry[]
}

export type AdminOwnerPage = {
  items: AdminOwner[]
  total: number
  offset: number
  limit: number
}

export async function getAdminOwners(params: {
  search?: string
  status?: string
  ownerType?: string
  offset?: number
  limit?: number
}) {
  const search = new URLSearchParams()
  if (params.search) search.set("search", params.search)
  if (params.status) search.set("status", params.status)
  if (params.ownerType) search.set("owner_type", params.ownerType)
  search.set("offset", String(params.offset || 0))
  search.set("limit", String(params.limit || 25))
  return authenticatedBackendFetch<AdminOwnerPage>(`/admin/owners?${search.toString()}`)
}

export async function getAdminOwner(ownerId: string) {
  return authenticatedBackendFetch<AdminOwnerDetail>(`/admin/owners/${ownerId}`)
}
