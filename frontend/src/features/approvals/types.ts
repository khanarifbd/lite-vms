export type ApprovalEntityType = "provider" | "owner" | "vehicle"
export type ApprovalQueueEntityType = ApprovalEntityType | "driver" | "document"
export type ApprovalDecision = "approve" | "reject" | "request_changes"
export type ApprovalStatusFilter =
  | "all"
  | "pending"
  | "under_review"
  | "expired"
  | "expiring_soon"
export type ApprovalSortOrder = "oldest" | "newest"
export type ApprovalCursorDirection = "next" | "previous"

export type ApprovalDocument = {
  id: string
  document_type: string
  document_number?: string | null
  document_reference?: string | null
  storage_key?: string | null
  file_name: string | null
  content_type?: string | null
  size_bytes?: number | null
  expires_at?: string | null
  status: string
  review_notes?: string | null
}

export type ProviderApprovalItem = {
  id: string
  application_number: string
  code: string
  legal_name: string
  trade_name: string | null
  district: string
  email: string
  phone: string
  technical_contact_name: string
  technical_contact_email: string
  technical_contact_phone: string
  btrc_license_number: string
  trade_license_number: string
  estimated_vehicle_count: number
  integration_status: string | null
  documents: ApprovalDocument[]
  status: string
  submitted_at: string
  reviewed_at: string | null
  review_notes: string | null
}

export type OwnerApprovalItem = {
  id: string
  application_number: string
  owner_code: string
  owner_type: string
  owner_name: string
  identity_or_registration_reference: string
  phone: string | null
  email: string | null
  registered_address: string
  district: string
  created_by_provider_name: string | null
  total_vehicles: number
  active_vehicles: number
  documents: ApprovalDocument[]
  verification_status: string
  submitted_at: string
  reviewed_at: string | null
  review_notes: string | null
}

export type VehicleOwnerSummary = {
  id: string
  owner_code: string | null
  owner_name: string
  phone: string | null
  email: string | null
}

export type VehicleApprovalItem = {
  id: string
  registration_number: string
  registration_number_display: string | null
  chassis_number: string
  engine_number: string | null
  vehicle_type: string
  brand: string | null
  model: string | null
  manufacturing_year: number | null
  color: string | null
  owner: VehicleOwnerSummary
  created_by_provider_name: string | null
  documents: ApprovalDocument[]
  verification_status: string
  created_at: string
  updated_at: string
  review_notes: string | null
}

export type DriverApprovalItem = {
  id: string
  driver_code: string
  full_name: string
  nid_reference: string
  date_of_birth: string | null
  blood_group: string | null
  mobile: string
  email: string
  present_address: string
  district: string
  employment_type: string | null
  medical_fitness_expiry_date: string | null
  current_vehicle_registration: string | null
  current_owner_name: string | null
  current_provider_name: string | null
  verification_status: string
  profile_change_status: string | null
  profile_change_submitted_at: string | null
  profile_change_review_notes: string | null
  pending_profile_changes: (Record<string, unknown> & {
    documents?: Array<{
      document_type: string
      document_reference?: string | null
      storage_key?: string | null
      file_name?: string | null
      content_type?: string | null
      size_bytes?: number | null
      expires_at?: string | null
    }>
  }) | null
  behaviour_score: number
  licence: {
    licence_number: string
    licence_type: string
    vehicle_classes: string[]
    issue_date: string | null
    expiry_date: string
    verification_status: string
  }
  documents: ApprovalDocument[]
  links: Array<{
    link_id: string
    organization_type: string
    organization_name: string
    status: string
  }>
  submitted_at: string
  reviewed_at: string | null
  review_notes: string | null
  created_at: string
  updated_at: string
}

export type DocumentApprovalItem = {
  id: string
  vehicle_id: string
  registration_number: string
  registration_number_display: string | null
  vehicle_verification_status: string
  owner: {
    id: string
    owner_code: string | null
    owner_name: string
    phone: string | null
  }
  provider: {
    id: string | null
    code: string | null
    name: string | null
  }
  document_type: string
  document_number: string | null
  issued_at: string | null
  expires_at: string | null
  expiry_status: string
  status: string
  source: string
  storage_key: string | null
  file_name: string | null
  content_type: string | null
  size_bytes: number | null
  version: number
  is_active: boolean
  review_notes: string | null
  review_required: boolean
  created_at: string
  updated_at: string
  documents: ApprovalDocument[]
}

export type ApprovalQueueItem =
  | ProviderApprovalItem
  | OwnerApprovalItem
  | VehicleApprovalItem
  | DriverApprovalItem
  | DocumentApprovalItem

export type ApprovalEntitySummary = {
  pending: number
  under_review: number
  total: number
}

export type DocumentApprovalSummary = ApprovalEntitySummary & {
  expired: number
  expiring_soon: number
}

export type ApprovalQueueSummary = {
  providers: ApprovalEntitySummary
  owners: ApprovalEntitySummary
  vehicles: ApprovalEntitySummary
  drivers: ApprovalEntitySummary
  documents: DocumentApprovalSummary
  total: number
}

export type ApprovalCursorPage<T = ApprovalQueueItem> = {
  entity: ApprovalQueueEntityType
  items: T[]
  next_cursor: string | null
  previous_cursor: string | null
  has_next: boolean
  has_previous: boolean
  limit: number
}

export type ApprovalQueueState = {
  entity: ApprovalQueueEntityType
  status: ApprovalStatusFilter
  sort: ApprovalSortOrder
  search: string
  limit: number
  cursor: string | null
  direction: ApprovalCursorDirection
  page: number
}
