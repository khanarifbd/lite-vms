import "server-only"

import type { ProviderVehicleDetails } from "@/features/provider/vehicle-detail-types"
import type {
  ProviderVehiclePage,
  ProviderVehicleRegistryQuery,
} from "@/features/provider/vehicle-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getProviderVehicles({
  page = 1,
  limit = 12,
  search = "",
  status = "",
  gps = "",
  tracking = "",
  cursor = "",
  ownerId = "",
  documentStatus = "",
}: ProviderVehicleRegistryQuery = {}) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)))
  const params = new URLSearchParams({ limit: String(safeLimit) })

  // Cursor mode remains available for callers that explicitly provide a cursor.
  // The provider vehicle portfolio uses page/offset mode so users can see the
  // current page, total page count, and jump directly between pages.
  if (cursor) {
    params.set("cursor", cursor)
  } else if (safePage > 1) {
    params.set("offset", String((safePage - 1) * safeLimit))
  }

  if (ownerId) params.set("owner_id", ownerId)
  if (documentStatus) params.set("document_status", documentStatus)

  if (search.trim()) params.set("search", search.trim())
  if (status) params.set("status", status)
  if (gps === "online") params.set("gps_online", "true")
  if (gps === "offline") params.set("gps_online", "false")
  if (tracking) params.set("tracking_status", tracking)

  return authenticatedBackendFetch<ProviderVehiclePage>(
    `/vehicles/registry?${params.toString()}`
  )
}

export async function getProviderVehicleDetails(vehicleId: string) {
  return authenticatedBackendFetch<ProviderVehicleDetails>(
    `/vehicles/provider-registration/${vehicleId}`
  )
}
