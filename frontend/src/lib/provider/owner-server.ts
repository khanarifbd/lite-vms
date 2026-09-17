import "server-only"

import type {
  ProviderOwnerOption,
  ProviderOwnerPage,
  ProviderOwnerPortfolioPage,
  ProviderOwnerSummary,
} from "@/features/provider/owner-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getProviderOwnerSummary() {
  return authenticatedBackendFetch<ProviderOwnerSummary>("/providers/me/owners/summary")
}

export async function getProviderOwnerPortfolio() {
  return authenticatedBackendFetch<ProviderOwnerPortfolioPage>(
    "/providers/me/owners/portfolio?limit=100"
  )
}

export async function getProviderOwners() {
  return authenticatedBackendFetch<ProviderOwnerPage>("/providers/me/owners?limit=100")
}

export async function getActiveProviderOwners() {
  return authenticatedBackendFetch<ProviderOwnerPage>(
    "/providers/me/owners?status=active&limit=200"
  )
}

export async function getActiveProviderOwnerOptions() {
  return authenticatedBackendFetch<ProviderOwnerOption[]>(
    "/providers/me/owners/options?limit=500"
  )
}
