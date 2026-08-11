import "server-only"

import { redirect } from "next/navigation"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export type MovementState = "moving" | "idle" | "stopped" | "offline" | "no_data"
export type MonitoringVehicleFilter = "all" | "online" | MovementState

export type MonitoringStats = {
  tracked_vehicles: number
  online_vehicles: number
  offline_vehicles: number
  moving_vehicles: number
  idle_vehicles: number
  stopped_vehicles: number
  no_data_vehicles: number
  active_providers: number
  unhealthy_providers: number
  expired_documents: number
  pending_violations: number
  overspeed_alerts: number
  geofence_alerts: number
  route_alerts: number
}

export type MonitoringVehicle = {
  id: string
  registration_number: string
  registration_number_display: string | null
  owner_name: string
  provider_name: string | null
  latitude: number | null
  longitude: number | null
  speed_kph: number | null
  last_known_speed_kph?: number | null
  heading: number | null
  ignition: boolean | null
  recorded_at: string | null
  received_at: string | null
  online: boolean
  movement_state: MovementState
  movement_state_changed_at: string | null
  state_duration_seconds: number
}

export type MonitoringVehicleDetail = {
  vehicle_id: string
  owner_id: string
  owner_name: string
  owner_code: string | null
  owner_phone: string | null
  provider_id: string | null
  provider_name: string | null
  provider_code: string | null
  provider_phone: string | null
  driver_id: string | null
  driver_name: string | null
  driver_code: string | null
  driver_phone: string | null
  driver_on_duty: boolean | null
  tax_token_expiry_date: string | null
  fitness_expiry_date: string | null
  route_permit_expiry_date: string | null
}

export type MonitoringFleetCounts = {
  all: number
  online: number
  offline: number
  moving: number
  idle: number
  stopped: number
  no_data: number
}

export type MonitoringVehicleCursorPage = {
  generated_at: string
  items: MonitoringVehicle[]
  counts: MonitoringFleetCounts | null
  next_cursor: string | null
  has_next: boolean
  limit: number
}

export type ProviderHealthItem = {
  provider_id: string
  provider_code: string
  provider_name: string
  source_status: string | null
  tracked_vehicles: number
  online_vehicles: number
  offline_vehicles: number
  last_seen_at: string | null
  health: "healthy" | "attention"
}

export type MonitoringAlert = {
  id: string
  vehicle_id: string
  registration_number: string
  violation_type: string
  status: string
  detected_value: number | null
  allowed_value: number | null
  latitude: number
  longitude: number
  detected_at: string
}

export type NationalMonitoringDashboard = {
  generated_at: string
  stats: MonitoringStats
  vehicles: MonitoringVehicle[]
  provider_health: ProviderHealthItem[]
  alerts: MonitoringAlert[]
}

export type MonitoringPlaybackPoint = {
  id: string
  recorded_at: string
  latitude: number
  longitude: number
  speed_kph: number
  heading: number | null
  ignition: boolean | null
}

export type MonitoringPlayback = {
  vehicle_id: string
  registration_number: string
  start_at: string
  end_at: string
  total_points: number
  max_speed_kph: number
  distance_km: number
  points: MonitoringPlaybackPoint[]
}

function handleMonitoringAuthError(error: unknown): never {
  if (error instanceof BackendApiError && error.status === 401) {
    redirect("/login")
  }
  throw error
}

export async function getNationalMonitoringDashboard() {
  try {
    return await authenticatedBackendFetch<NationalMonitoringDashboard>("/admin/monitoring")
  } catch (error) {
    handleMonitoringAuthError(error)
  }
}

export async function getInitialMonitoringVehiclePage() {
  try {
    return await authenticatedBackendFetch<MonitoringVehicleCursorPage>(
      "/admin/monitoring/vehicles?state=all&limit=100&include_counts=true"
    )
  } catch (error) {
    handleMonitoringAuthError(error)
  }
}

export function monitoringVehiclePageToDashboard(
  page: MonitoringVehicleCursorPage
): NationalMonitoringDashboard {
  const counts = page.counts ?? {
    all: page.items.length,
    online: page.items.filter((vehicle) => vehicle.online).length,
    offline: page.items.filter((vehicle) => vehicle.movement_state === "offline").length,
    moving: page.items.filter((vehicle) => vehicle.movement_state === "moving").length,
    idle: page.items.filter((vehicle) => vehicle.movement_state === "idle").length,
    stopped: page.items.filter((vehicle) => vehicle.movement_state === "stopped").length,
    no_data: page.items.filter((vehicle) => vehicle.movement_state === "no_data").length,
  }

  return {
    generated_at: page.generated_at,
    vehicles: page.items,
    provider_health: [],
    alerts: [],
    stats: {
      tracked_vehicles: counts.all,
      online_vehicles: counts.online,
      offline_vehicles: counts.offline,
      moving_vehicles: counts.moving,
      idle_vehicles: counts.idle,
      stopped_vehicles: counts.stopped,
      no_data_vehicles: counts.no_data,
      active_providers: 0,
      unhealthy_providers: 0,
      expired_documents: 0,
      pending_violations: 0,
      overspeed_alerts: 0,
      geofence_alerts: 0,
      route_alerts: 0,
    },
  }
}
