export type VehicleDocumentType =
  | "registration"
  | "fitness"
  | "tax_token"
  | "insurance"
  | "route_permit"

export type VehicleDocument = {
  id: string
  vehicle_id: string
  document_type: VehicleDocumentType
  document_number: string | null
  issued_at: string | null
  expires_at: string | null
  verification_status: string
  effective_status: string
  expiry_status: "not_applicable" | "valid" | "expiring_soon" | "expired"
  source: string
  file_name: string | null
  content_type: string | null
  size_bytes: number | null
  version: number
  is_active: boolean
  replaced_by_id: string | null
  verified_at: string | null
  review_notes: string | null
  download_url: string
  created_at: string
  updated_at: string
}

export type VehicleDocumentPage = {
  items: VehicleDocument[]
  total: number
  active_count: number
  history_count: number
}
