import "server-only"

import type { ProviderApplication } from "@/features/provider/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function getMyProviderApplication(): Promise<ProviderApplication | null> {
  try {
    return await authenticatedBackendFetch<ProviderApplication>("/providers/me")
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) {
      return null
    }
    throw error
  }
}
