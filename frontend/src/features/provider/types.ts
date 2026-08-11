export type ProviderDocumentType =
  | "btrc_license"
  | "trade_license"
  | "incorporation_certificate"
  | "tin_certificate"
  | "bin_certificate"
  | "authorized_person_id"
  | "other"

export type ProviderDocument = {
  id: string
  document_type: ProviderDocumentType
  document_number: string | null
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

export type ProviderApplication = {
  id: string
  application_number: string
  code: string
  tenant_public_id: string
  organization_public_id: string
  primary_admin_user_public_id: string
  legal_name: string
  trade_name: string | null
  company_type: string | null
  incorporation_date: string | null
  btrc_license_number: string
  btrc_license_issue_date: string | null
  btrc_license_expiry_date: string | null
  trade_license_number: string
  trade_license_expiry_date: string | null
  company_registration_number: string | null
  tin_number: string | null
  bin_number: string | null
  registered_address: string
  district: string
  website_url: string | null
  authorized_representative_name: string | null
  authorized_representative_nid: string | null
  authorized_representative_designation: string | null
  authorized_representative_mobile: string | null
  authorized_representative_email: string | null
  contact_person: string
  phone: string
  email: string
  technical_contact_name: string
  technical_contact_phone: string
  technical_contact_email: string
  operations_contact_name: string | null
  operations_contact_phone: string | null
  operations_contact_email: string | null
  support_contact_name: string | null
  support_contact_phone: string | null
  support_contact_email: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_email: string | null
  service_coverage: string[]
  supported_protocols: string[]
  supported_device_brands: string[]
  api_base_url: string | null
  estimated_vehicle_count: number
  current_platform_name: string | null
  data_submission_interval_seconds: number | null
  integration_status: string | null
  last_telemetry_received_at: string | null
  allowed_server_ips: string[]
  documents: ProviderDocument[]
  linked_owner_count: number
  registered_device_count: number
  active_vehicle_count: number
  online_vehicle_count: number
  telemetry_source_id: string | null
  telemetry_source_code: string | null
  telemetry_source_status: string | null
  provider_staff_count: number
  declaration_accepted: boolean
  submitted_at: string
  reviewed_at: string | null
  review_notes: string | null
  status: "pending" | "under_review" | "approved" | "rejected" | "suspended"
  created_at: string
  updated_at: string
}

export type ProviderRegistrationResult = {
  provider: ProviderApplication
  account_can_login: boolean
  message: string
}

export type DocumentUploadResult = {
  storage_key: string
  original_file_name: string
  content_type: string
  size_bytes: number
  download_url: string
}

export type ProviderDocumentPayload = {
  document_type: ProviderDocumentType
  document_number?: string | null
  storage_key: string
  file_name?: string | null
  content_type?: string | null
  size_bytes?: number | null
  expires_at?: string | null
}

export type ProviderApplicationPayload = {
  legal_name: string
  trade_name?: string | null
  company_type?: string | null
  incorporation_date?: string | null
  btrc_license_number: string
  btrc_license_issue_date?: string | null
  btrc_license_expiry_date?: string | null
  trade_license_number: string
  trade_license_expiry_date?: string | null
  company_registration_number?: string | null
  tin_number?: string | null
  bin_number?: string | null
  registered_address: string
  district: string
  website_url?: string | null
  authorized_representative_name?: string | null
  authorized_representative_nid?: string | null
  authorized_representative_designation?: string | null
  authorized_representative_mobile?: string | null
  authorized_representative_email?: string | null
  technical_contact_name: string
  technical_contact_email: string
  technical_contact_mobile: string
  operations_contact_name?: string | null
  operations_contact_phone?: string | null
  operations_contact_email?: string | null
  support_contact_name?: string | null
  support_contact_phone?: string | null
  support_contact_email?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_email?: string | null
  service_coverage: string[]
  supported_protocols: string[]
  supported_device_brands: string[]
  api_base_url?: string | null
  estimated_vehicle_count: number
  current_platform_name?: string | null
  data_submission_interval_seconds?: number | null
  integration_status?: string | null
  allowed_server_ips: string[]
  documents?: ProviderDocumentPayload[]
  declaration_accepted: boolean
}
