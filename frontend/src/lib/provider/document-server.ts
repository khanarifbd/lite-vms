import "server-only"

import type { VehicleDocumentPage } from "@/features/vehicles/document-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getProviderVehicleDocuments(
  vehicleId: string,
  includeHistory = true
) {
  const normalizedVehicleId = vehicleId.trim()
  if (!normalizedVehicleId) {
    throw new Error("Vehicle ID is required to load documents.")
  }

  const params = new URLSearchParams({
    include_history: includeHistory ? "true" : "false",
  })
  return authenticatedBackendFetch<VehicleDocumentPage>(
    `/vehicles/provider-registration/${encodeURIComponent(normalizedVehicleId)}/documents?${params.toString()}`
  )
}
