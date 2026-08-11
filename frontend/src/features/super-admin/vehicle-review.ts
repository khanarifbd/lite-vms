import "server-only"

import { authenticatedBackendFetch } from "@/lib/api/server"

export type AdminVehicleDocument = {
  id: string
  document_type: string
  document_number: string | null
  issued_at: string | null
  expires_at: string | null
  status: string
  storage_key: string | null
  file_name: string | null
  version: number
  is_active: boolean
  review_notes: string | null
}

export type AdminVehicle = {
  id: string
  registration_number: string
  registration_number_display: string | null
  chassis_number: string
  engine_number: string | null
  vehicle_type: string
  vehicle_category: string | null
  usage_type: string | null
  body_type: string | null
  fuel_type: string | null
  brand: string | null
  model: string | null
  manufacturing_year: number | null
  registration_date: string | null
  registration_authority: string | null
  engine_capacity_cc: number | null
  axle_count: number | null
  gross_vehicle_weight_kg: number | null
  color: string | null
  seating_capacity: number | null
  load_capacity_kg: number | null
  fitness_expiry_date: string | null
  tax_token_expiry_date: string | null
  insurance_expiry_date: string | null
  route_permit_number: string | null
  route_permit_area: string | null
  route_permit_expiry_date: string | null
  notes: string | null
  owner_id: string
  owner: {
    id: string
    owner_code: string | null
    owner_name: string
    phone: string | null
    email: string | null
  }
  created_by_provider_id: string | null
  created_by_provider_name: string | null
  default_speed_limit_kph: number
  latest_latitude: number | null
  latest_longitude: number | null
  latest_speed_kph: number | null
  last_recorded_at: string | null
  gps_online: boolean
  tracking_last_seen_at: string | null
  latest_heading: number | null
  latest_ignition: boolean | null
  verification_status: string
  review_notes: string | null
  status: string
  documents: AdminVehicleDocument[]
  active_assignment_id: string | null
  tracking_assignment_id: string | null
  tracking_assignment_status: string | null
  tracking_source_type: string | null
  tracking_source_code: string | null
  tracking_provider_id: string | null
  tracking_provider_name: string | null
  tracking_device_id: string | null
  tracking_device_identifier: string | null
  tracking_device_operational_status: string | null
  current_driver_assignment_id: string | null
  current_driver_assignment_status: string | null
  current_driver_id: string | null
  current_driver_name: string | null
  current_driver_mobile: string | null
  current_driver_licence_number: string | null
  current_driver_licence_status: string | null
  current_driver_licence_expiry: string | null
  qr_token: string | null
  created_at: string
  updated_at: string
}

export type AdminVehiclePage = {
  items: AdminVehicle[]
  total: number
  offset: number
  limit: number
}

export type AdminVehicleDetail = {
  vehicle: AdminVehicle
  qr: {
    id: string | null
    token: string | null
    is_active: boolean
    issued_at: string | null
  }
  review_history: Array<{
    id: string
    action: string
    actor_name: string | null
    reason: string | null
    created_at: string
  }>
}

export async function getAdminVehicles(params: {
  search?: string
  status?: string
  offset?: number
  limit?: number
}) {
  const query = new URLSearchParams()
  if (params.search) query.set("search", params.search)
  if (params.status) query.set("status", params.status)
  query.set("offset", String(params.offset || 0))
  query.set("limit", String(params.limit || 25))
  return authenticatedBackendFetch<AdminVehiclePage>(`/admin/vehicles?${query.toString()}`)
}

export async function getAdminVehicle(vehicleId: string) {
  return authenticatedBackendFetch<AdminVehicleDetail>(`/admin/vehicles/${vehicleId}`)
}
