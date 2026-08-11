export type ProviderTelemetryApiKeyStatus = {
  provider_id: string
  source_id: string | null
  source_code: string | null
  source_status: string | null
  configured: boolean
  key_prefix: string | null
  key_last_four: string | null
  created_at: string | null
  rotated_at: string | null
  revoked_at: string | null
  last_authenticated_at: string | null
  ingestion_path: string
  header_name: string
}

export type ProviderTelemetryApiKeyIssueResult = ProviderTelemetryApiKeyStatus & {
  api_key: string
  message: string
}
