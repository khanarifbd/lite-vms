import "server-only"

import type { DriverDutyHistoryPage } from "@/features/driver/duty-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export type AdminDriverDocument = {
  id: string
  document_type: string
  document_reference: string | null
  storage_key: string
  file_name: string | null
  status: string
  expires_at: string | null
  review_notes: string | null
}

export type AdminDriver = {
  id: string
  driver_code: string
  full_name: string
  nid_reference: string | null
  date_of_birth: string | null
  father_name: string | null
  mother_name: string | null
  gender: string | null
  blood_group: string | null
  mobile: string
  email: string
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  present_address: string
  permanent_address: string | null
  district: string
  employment_type: string | null
  medical_fitness_expiry_date: string | null
  shift_information: string | null
  photo_url: string | null
  suspension_reason: string | null
  current_vehicle_id: string | null
  current_vehicle_registration: string | null
  current_assignment_started_at: string | null
  current_owner_name: string | null
  current_provider_name: string | null
  claim_status: string
  verification_status: string
  behaviour_score: number
  licence: {
    licence_number: string
    licence_type: string
    vehicle_classes: string[]
    first_issue_date: string | null
    issue_date: string | null
    expiry_date: string
    issuing_authority: string
    verification_status: string
    review_notes: string | null
  }
  documents: AdminDriverDocument[]
  links: Array<{
    link_id: string
    organization_type: string
    organization_id: string
    organization_name: string
    status: string
  }>
  account: {
    display_name: string
    username: string | null
    email: string
    mobile: string
    must_change_password: boolean
  }
  status: string
  submitted_at: string
  reviewed_at: string | null
  review_notes: string | null
  application_locked: boolean
  profile_change_status: string | null
  profile_change_submitted_at: string | null
  profile_change_reviewed_at: string | null
  profile_change_review_notes: string | null
  created_at: string
  updated_at: string
}

export type AdminDriverHistoryEntry = {
  id: string
  action: string
  actor_name: string | null
  reason: string | null
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

export type AdminDriverDetail = {
  driver: AdminDriver
  pending_profile_changes: Record<string, unknown> | null
  account_status: string
  last_administrative_reason: string | null
  history: AdminDriverHistoryEntry[]
}

export type AdminDriverPage = {
  items: AdminDriver[]
  total: number
  offset: number
  limit: number
}

export async function getAdminDrivers(input: {
  search?: string
  status?: string
  offset?: number
  limit?: number
}) {
  const params = new URLSearchParams({
    offset: String(input.offset ?? 0),
    limit: String(input.limit ?? 20),
  })
  if (input.search) params.set("search", input.search)
  if (input.status) params.set("verification_status", input.status)
  return authenticatedBackendFetch<AdminDriverPage>(`/drivers?${params.toString()}`)
}

export async function getAdminDriver(driverId: string) {
  return authenticatedBackendFetch<AdminDriver>(`/drivers/${driverId}`)
}

export async function getAdminDriverDetail(driverId: string) {
  return authenticatedBackendFetch<AdminDriverDetail>(`/admin/drivers/${driverId}`)
}


export async function getAdminDriverDutyHistory(input: {
  search?: string
  driverId?: string
  vehicleId?: string
  fromAt?: string
  toAt?: string
  at?: string
  offset?: number
  limit?: number
}) {
  const params = new URLSearchParams({
    offset: String(input.offset ?? 0),
    limit: String(input.limit ?? 50),
  })
  if (input.search) params.set("search", input.search)
  if (input.driverId) params.set("driver_id", input.driverId)
  if (input.vehicleId) params.set("vehicle_id", input.vehicleId)
  if (input.fromAt) params.set("from_at", input.fromAt)
  if (input.toAt) params.set("to_at", input.toAt)
  if (input.at) params.set("at", input.at)
  return authenticatedBackendFetch<DriverDutyHistoryPage>(
    `/assignments/duty-history?${params.toString()}`
  )
}
