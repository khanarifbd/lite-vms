import "server-only"

import { authenticatedBackendFetch } from "@/lib/api/server"

export type StaffIdentifier = {
  public_id: string
  identifier_type: string
  masked_value: string
  is_primary: boolean
  is_verified: boolean
  disabled_at: string | null
}

export type AdminStaff = {
  public_id: string
  display_name: string
  status: string
  role_codes: string[]
  organization_public_id: string | null
  organization_name: string | null
  organization_code: string | null
  designation: string | null
  member_code: string | null
  identifiers: StaffIdentifier[]
  created_at: string
}

export type AdminStaffPage = {
  items: AdminStaff[]
  total: number
  offset: number
  limit: number
}

export type StaffAuditItem = {
  id: string
  action: string
  actor_name: string | null
  reason: string | null
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

export type AdminStaffDetail = {
  user: AdminStaff
  audit_history: StaffAuditItem[]
}

export type AdminOrganization = {
  public_id: string
  tenant_public_id: string
  parent_public_id: string | null
  organization_type: string
  code: string
  name_en: string
  name_bn: string | null
  registration_number: string | null
  status: string
}

export async function getAdminStaff(params: {
  search?: string
  status?: string
  role?: string
  organization?: string
  offset?: number
  limit?: number
}) {
  const query = new URLSearchParams()
  if (params.search) query.set("search", params.search)
  if (params.status) query.set("status", params.status)
  if (params.role) query.set("role", params.role)
  if (params.organization) query.set("organization_public_id", params.organization)
  query.set("offset", String(params.offset || 0))
  query.set("limit", String(params.limit || 25))
  return authenticatedBackendFetch<AdminStaffPage>(`/admin/staff?${query.toString()}`)
}

export async function getAdminStaffDetail(userId: string) {
  return authenticatedBackendFetch<AdminStaffDetail>(`/admin/staff/${userId}`)
}

export async function getAdminOrganizations() {
  return authenticatedBackendFetch<AdminOrganization[]>("/iam/organizations")
}
