import "server-only"

import type { ProviderApplication } from "@/features/provider/types"
import type { ProviderTelemetryApiKeyStatus } from "@/features/provider/telemetry-api-key-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getProviderIntegration() {
  return authenticatedBackendFetch<ProviderApplication>("/providers/me/integration")
}

export async function getProviderTelemetryApiKeyStatus(providerId: string) {
  return authenticatedBackendFetch<ProviderTelemetryApiKeyStatus>(
    `/providers/${providerId}/telemetry-api-key`
  )
}
