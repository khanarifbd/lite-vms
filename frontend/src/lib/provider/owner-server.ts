import "server-only"

import type {
  ProviderOwnerPage,
  ProviderOwnerSummary,
} from "@/features/provider/owner-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getProviderOwnerSummary() {
  return authenticatedBackendFetch<ProviderOwnerSummary>("/providers/me/owners/summary")
}

export async function getProviderOwners() {
  return authenticatedBackendFetch<ProviderOwnerPage>("/providers/me/owners?limit=100")
}

export async function getActiveProviderOwners() {
  return authenticatedBackendFetch<ProviderOwnerPage>(
    "/providers/me/owners?status=active&limit=200"
  )
}
