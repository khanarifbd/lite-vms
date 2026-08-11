export type DriverDocument = {
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

export type DriverLicence = {
  id: string
  licence_number: string
  licence_type: string
  vehicle_classes: string[]
  first_issue_date: string | null
  issue_date: string | null
  expiry_date: string
  issuing_authority: string
  verification_status: string
  verified_at: string | null
  review_notes: string | null
}

export type DriverLink = {
  link_id: string
  organization_type: string
  organization_id: string
  organization_name: string
  status: string
}

export type DriverProfile = {
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
  photo_url: string | null
  employment_type: string | null
  shift_information: string | null
  medical_fitness_expiry_date: string | null
  suspension_reason: string | null
  current_vehicle_id: string | null
  current_vehicle_registration: string | null
  current_assignment_id: string | null
  current_assignment_is_on_duty: boolean
  current_assignment_started_at: string | null
  current_owner_name: string | null
  current_provider_name: string | null
  claim_status: string
  verification_status: string
  behaviour_score: number
  licence: DriverLicence
  documents: DriverDocument[]
  links: DriverLink[]
  account: {
    user_public_id: string
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

export type DocumentUploadResult = {
  storage_key: string
  original_file_name: string
  content_type: string
  size_bytes: number
  download_url: string
}

export type DriverApplicationPayload = {
  full_name: string
  nid_reference: string
  date_of_birth: string | null
  father_name: string | null
  mother_name: string | null
  gender: string | null
  blood_group: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  present_address: string
  permanent_address: string | null
  district: string
  photo_url: string | null
  employment_type: string | null
  shift_information: string | null
  medical_fitness_expiry_date: string | null
  vehicle_classes: string[]
  first_issue_date: string | null
  issue_date: string | null
  licence_expiry_date: string
  documents: Array<{
    document_type: string
    document_reference: string | null
    storage_key: string
    file_name: string | null
    content_type: string | null
    size_bytes: number | null
    expires_at: string | null
  }>
  declaration_accepted: boolean
}
