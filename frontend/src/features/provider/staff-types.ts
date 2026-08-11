export type ProviderStaffRole =
  | "vts_admin"
  | "vts_operator"
  | "vts_technical"
  | "vts_viewer"

export type ProviderStaffStatus = "active" | "suspended" | "disabled"

export type ProviderMembershipStatus = "pending" | "active" | "suspended" | "ended"

export type ProviderStaffMember = {
  user_public_id: string
  membership_public_id: string
  display_name: string
  email: string | null
  mobile: string | null
  user_status: ProviderStaffStatus | "pending" | "locked" | "deleted"
  membership_status: ProviderMembershipStatus
  role_code: ProviderStaffRole | string
  role_name: string
  employee_id: string | null
  designation: string | null
  is_technical_contact: boolean
  is_primary_admin: boolean
  must_change_password: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export type ProviderStaffPage = {
  items: ProviderStaffMember[]
  total: number
  offset: number
  limit: number
}

export type ProviderStaffCreatePayload = {
  email: string
  mobile?: string | null
  full_name: string
  temporary_password: string
  role_code: Exclude<ProviderStaffRole, "vts_admin">
  employee_id?: string | null
  designation?: string | null
  is_technical_contact: boolean
}

export type ProviderStaffUpdatePayload = {
  display_name?: string
  email?: string
  mobile?: string | null
  role_code?: Exclude<ProviderStaffRole, "vts_admin">
  employee_id?: string | null
  designation?: string | null
  is_technical_contact?: boolean
  status?: ProviderStaffStatus
}

export const PROVIDER_STAFF_ROLE_OPTIONS: Array<{
  value: Exclude<ProviderStaffRole, "vts_admin">
  label: string
  description: string
}> = [
  {
    value: "vts_operator",
    label: "Operations Officer",
    description: "Manage owners, vehicles, tracking assignments, and driver operations.",
  },
  {
    value: "vts_technical",
    label: "Technical Officer",
    description: "Manage telemetry integration, device connections, and technical operations.",
  },
  {
    value: "vts_viewer",
    label: "Read-only Viewer",
    description: "View provider records and operational data without making changes.",
  },
]
