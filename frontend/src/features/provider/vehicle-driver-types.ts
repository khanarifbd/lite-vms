export type ProviderDriverCandidate = {
  id: string
  driver_code: string
  full_name: string
  phone: string
  email: string
  district: string
  photo_url: string | null
  behaviour_score: number
  verification_status: string
  account_status: string
  licence_number: string | null
  licence_expiry: string | null
  licence_status: string | null
  available_for_assignment: boolean
  unavailable_reason: string | null
}

export type ProviderVehicleDriverAssignment = {
  id: string
  driver_id: string
  driver_code: string
  full_name: string
  phone: string
  status: string
  is_on_duty: boolean
  valid_from: string
}

export type ProviderVehicleDriverWorkspace = {
  vehicle_id: string
  registration_number: string
  owner_id: string
  owner_name: string
  can_assign: boolean
  candidates: ProviderDriverCandidate[]
  active_assignments: ProviderVehicleDriverAssignment[]
}
