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

export async function getActiveProviderOwnerOptions() {
  return authenticatedBackendFetch<ProviderOwnerOption[]>(
    "/providers/me/owners/options?limit=500"
  )
}

export async function getActiveProviderOwners() {
  const items = await getActiveProviderOwnerOptions()
  return {
    items: items.map((owner) => ({
      link: { status: "active" as const },
      owner: {
        id: owner.id,
        owner_name: owner.owner_name,
        owner_code: owner.owner_code,
        identity_or_registration_reference: owner.identity_reference,
        phone: owner.phone,
      },
    })),
  }
}
