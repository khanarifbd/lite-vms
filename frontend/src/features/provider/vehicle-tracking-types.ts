export type ProviderTrackingDevice = {
  id: string
  source_id: string
  device_identifier: string
  imei: string | null
  manufacturer: string | null
  model: string | null
  protocol: string | null
  firmware_version: string | null
  sim_number: string | null
  data_frequency_seconds: number | null
  ownership_type: string
  owner_id: string | null
  provider_id: string | null
  certification_status: string
  operational_status: string
  last_tested_at: string | null
  last_seen_at: string | null
}

export type ProviderTrackingSource = {
  id: string
  code: string
  source_type: string
  tenant_public_id: string
  provider_id: string | null
  owner_id: string | null
  status: string
  approved_at: string | null
  status_reason: string | null
}

export type ProviderVehicleTrackingAssignment = {
  id: string
  vehicle_id: string
  owner_id: string
  provider_id: string | null
  source: ProviderTrackingSource
  device: ProviderTrackingDevice
  account_reference: string | null
  valid_from: string
  valid_to: string | null
  status: string
  is_primary: boolean
  provider_confirmed_at: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export type ProviderVehicleTrackingWorkspace = {
  current_assignment: ProviderVehicleTrackingAssignment | null
  assignments: ProviderVehicleTrackingAssignment[]
  available_devices: ProviderTrackingDevice[]
  active_count: number
  history_count: number
}

export type ProviderDeviceAssignmentPayload = {
  existing_device_id?: string | null
  device_identifier?: string | null
  imei?: string | null
  manufacturer?: string | null
  model?: string | null
  protocol?: string | null
  firmware_version?: string | null
  sim_number?: string | null
  data_frequency_seconds?: number | null
  account_reference?: string | null
}

export type ProviderDeviceIdentityAvailability = {
  available: boolean
  device_identifier_available: boolean
  imei_available: boolean
}
