export type OwnerType = "individual" | "company"

export type OwnerVerificationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "suspended"

export type OwnerProviderLinkStatus =
  | "pending_owner_approval"
  | "pending_provider_approval"
  | "active"
  | "rejected"
  | "suspended"
  | "ended"

export type OwnerDocumentType =
  | "national_id"
  | "passport"
  | "company_registration"
  | "trade_license"
  | "tin_certificate"
  | "bin_certificate"
  | "authorized_person_id"
  | "other"

export type OwnerDocumentPayload = {
  document_type: OwnerDocumentType
  document_reference?: string | null
  storage_key: string
  file_name?: string | null
  content_type?: string | null
  size_bytes?: number | null
  expires_at?: string | null
}

export type OwnerDocument = OwnerDocumentPayload & {
  id: string
  file_url: string | null
  status: string
  version: number
  is_active: boolean
  replaced_by_id: string | null
  verified_at: string | null
  review_notes: string | null
}

export type ProviderLinkSummary = {
  provider_id: string
  provider_code: string
  provider_name: string
  status: OwnerProviderLinkStatus
}

export type OwnerApplication = {
  id: string
  application_number: string
  owner_code: string
  tenant_public_id: string
  organization_public_id: string
  primary_admin_user_public_id: string | null
  created_by_provider_id: string | null
  created_by_provider_name: string | null
  owner_type: OwnerType
  owner_name: string
  identity_or_registration_reference: string
  claim_status: string
  date_of_birth: string | null
  father_name: string | null
  mother_name: string | null
  gender: string | null
  profile_photo_storage_key: string | null
  present_address: string | null
  permanent_address: string | null
  division: string | null
  upazila: string | null
  postal_code: string | null
  alternate_phone: string | null
  company_type: string | null
  incorporation_date: string | null
  authorized_person_name: string | null
  authorized_person_nid: string | null
  authorized_person_designation: string | null
  authorized_person_mobile: string | null
  authorized_person_email: string | null
  company_logo_storage_key: string | null
  head_office_address: string | null
  operating_address: string | null
  trade_license_number: string | null
  tin_number: string | null
  bin_number: string | null
  phone: string | null
  email: string | null
  account_username: string | null
  account_status: string | null
  registered_address: string
  district: string
  website_url: string | null
  documents: OwnerDocument[]
  linked_providers: ProviderLinkSummary[]
  total_vehicles: number
  active_vehicles: number
  linked_drivers_count: number
  active_vts_providers_count: number
  primary_vts_provider: ProviderLinkSummary | null
  declaration_accepted: boolean
  submitted_at: string | null
  reviewed_at: string | null
  review_notes: string | null
  verification_status: OwnerVerificationStatus
  status: string
  created_at: string
  updated_at: string
}

export type OwnerProviderLink = {
  id: string
  owner_id: string
  owner_name: string
  identity_or_registration_reference: string
  provider_id: string
  provider_code: string
  provider_name: string
  status: OwnerProviderLinkStatus
  requested_by: "provider" | "owner"
  requested_at: string
  responded_at: string | null
  ended_at: string | null
  reason: string | null
  created_at: string
  updated_at: string
}

export type ProviderOwnerCustomer = {
  link: OwnerProviderLink
  owner: OwnerApplication
  account: {
    public_id: string
    display_name: string
    username: string | null
    email: string | null
    mobile: string | null
    status: string
    must_change_password: boolean
    last_login_at: string | null
  } | null
  can_manage: boolean
}

export type ProviderOwnerPage = {
  items: ProviderOwnerCustomer[]
  total: number
  offset: number
  limit: number
}

export type ProviderOwnerSummary = {
  provider_id: string
  total: number
  active: number
  pending_owner_approval: number
  pending_provider_approval: number
  rejected: number
  ended: number
  suspended: number
}

export type OwnerLookupResult = {
  exists: boolean
  owner_id: string | null
  owner_name: string | null
  identity_or_registration_reference: string | null
  phone: string | null
  username: string | null
  account_exists: boolean
  claim_status: string | null
  verification_status: OwnerVerificationStatus | null
  current_provider_link_status: OwnerProviderLinkStatus | null
  linked_providers: ProviderLinkSummary[]
  next_action: string
}

export type ProviderOwnerRegistrationResult = {
  owner: OwnerApplication
  link: OwnerProviderLink
  already_registered: boolean
  login_username: string | null
  must_change_password: boolean
  message: string
}

export type ProviderOwnerRegistrationPayload = {
  owner_type: OwnerType
  owner_name: string
  identity_or_registration_reference: string
  phone?: string | null
  email?: string | null
  date_of_birth?: string | null
  father_name?: string | null
  mother_name?: string | null
  gender?: string | null
  present_address?: string | null
  permanent_address?: string | null
  division?: string | null
  upazila?: string | null
  postal_code?: string | null
  alternate_phone?: string | null
  company_type?: string | null
  incorporation_date?: string | null
  authorized_person_name?: string | null
  authorized_person_nid?: string | null
  authorized_person_designation?: string | null
  authorized_person_mobile?: string | null
  authorized_person_email?: string | null
  head_office_address?: string | null
  operating_address?: string | null
  trade_license_number?: string | null
  tin_number?: string | null
  bin_number?: string | null
  registered_address: string
  district: string
  website_url?: string | null
  documents: OwnerDocumentPayload[]
  declaration_accepted: boolean
  contact_email: string
  contact_mobile?: string | null
  contact_name: string
  login_username?: string | null
  temporary_password?: string | null
}
