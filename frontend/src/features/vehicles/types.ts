export type VehicleOwnerDetails = {
  id: string
  owner_code: string | null
  owner_name: string
  phone: string | null
  email: string | null
}

export type VehicleDocumentSummary = {
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
}

export type VehicleDetails = {
  id: string
  registration_number: string
  registration_number_display: string | null
  registered_owner_name: string
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
  vehicle_photo_storage_key: string | null
  front_photo_storage_key: string | null
  back_photo_storage_key: string | null
  registration_certificate_storage_key: string | null
  fitness_expiry_date: string | null
  tax_token_expiry_date: string | null
  insurance_expiry_date: string | null
  route_permit_number: string | null
  route_permit_area: string | null
  route_permit_expiry_date: string | null
  vts_installation_date: string | null
  notes: string | null
  owner_id: string
  owner: VehicleOwnerDetails
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
  documents: VehicleDocumentSummary[]
  fitness_status: string | null
  tax_token_status: string | null
  insurance_status: string | null
  route_permit_status: string | null
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

export type VehicleUpdatePayload = Partial<{
  registration_number: string
  registration_number_display: string | null
  registered_owner_name: string | null
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
  route_permit_number: string | null
  route_permit_area: string | null
  route_permit_expiry_date: string | null
  fitness_expiry_date: string | null
  tax_token_expiry_date: string | null
  insurance_expiry_date: string | null
  vts_installation_date: string | null
  notes: string | null
  default_speed_limit_kph: number
}>
