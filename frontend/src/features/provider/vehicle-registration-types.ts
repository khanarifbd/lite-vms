export type ProviderVehicleRegistrationPayload = {
  owner_id: string
  registration_number: string
  registration_number_display?: string | null
  chassis_number: string
  engine_number?: string | null
  vehicle_type: string
  vehicle_category?: string | null
  usage_type?: string | null
  body_type?: string | null
  fuel_type?: string | null
  brand?: string | null
  model?: string | null
  manufacturing_year?: number | null
  registration_date?: string | null
  registration_authority?: string | null
  engine_capacity_cc?: number | null
  axle_count?: number | null
  gross_vehicle_weight_kg?: number | null
  color?: string | null
  seating_capacity?: number | null
  load_capacity_kg?: number | null
  route_permit_number?: string | null
  route_permit_area?: string | null
  route_permit_expiry_date?: string | null
  fitness_expiry_date?: string | null
  tax_token_expiry_date?: string | null
  insurance_expiry_date?: string | null
  notes?: string | null
  default_speed_limit_kph: number
  submit_for_review: boolean
}

export type ProviderVehicleRegistrationResult = {
  id: string
  registration_number: string
  registration_number_display: string | null
  chassis_number: string
  engine_number: string | null
  vehicle_type: string
  owner_id: string
  verification_status: string
  status: string
  created_at: string
  updated_at: string
}

export type VehicleIdentityAvailability = {
  available: boolean
  registration_number_available: boolean
  chassis_number_available: boolean
  engine_number_available: boolean
}
