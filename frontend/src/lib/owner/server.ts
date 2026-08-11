import "server-only"

import type {
  OwnerApplication,
  OwnerDashboardData,
  OwnerDriverAssignment,
  OwnerDriverLinkPage,
  OwnerDocument,
  OwnerProviderConnectionWorkspace,
  OwnerProviderLinkPage,
  OwnerVehiclePage,
} from "@/features/owner/types"
import type { VehicleDocumentPage } from "@/features/vehicles/document-types"
import type { VehicleDetails } from "@/features/vehicles/types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export type OwnerVehicleRegistryQuery = {
  limit?: number
  search?: string
  status?: string
  cursor?: string
  documentStatus?: "required" | "expired" | "expiring"
}

export async function getMyOwnerApplication() {
  return authenticatedBackendFetch<OwnerApplication>("/owners/me")
}

export async function getMyOwnerDocuments() {
  return authenticatedBackendFetch<OwnerDocument[]>("/owners/me/documents")
}

export async function getOwnerDriverLinks() {
  return authenticatedBackendFetch<OwnerDriverLinkPage>(
    "/drivers/owner-links?offset=0&limit=200"
  )
}

export async function getOwnerDriverAssignments() {
  return authenticatedBackendFetch<OwnerDriverAssignment[]>(
    "/assignments?status=active"
  )
}


export async function getMyProviderLinks() {
  return authenticatedBackendFetch<OwnerProviderLinkPage>(
    "/owners/provider-links?offset=0&limit=100"
  )
}

export async function getOwnerProviderConnectionWorkspace() {
  return authenticatedBackendFetch<OwnerProviderConnectionWorkspace>(
    "/owners/me/provider-connections"
  )
}

export async function getMyVehicles(query: OwnerVehicleRegistryQuery = {}) {
  const limit = Math.min(100, Math.max(1, query.limit || 24))
  const params = new URLSearchParams({ limit: String(limit) })

  if (query.search?.trim()) params.set("search", query.search.trim())
  if (query.status?.trim()) params.set("status", query.status.trim())
  if (query.cursor?.trim()) params.set("cursor", query.cursor.trim())
  if (query.documentStatus) params.set("document_status", query.documentStatus)

  return authenticatedBackendFetch<OwnerVehiclePage>(
    `/vehicles/registry?${params.toString()}`
  )
}

export async function getMyVehicleDetails(vehicleId: string) {
  return authenticatedBackendFetch<VehicleDetails>(`/vehicles/${vehicleId}`)
}

export async function getOwnerVehicleDocuments(
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
    `/vehicles/owner-registration/${encodeURIComponent(normalizedVehicleId)}/documents?${params.toString()}`
  )
}

export async function getOwnerDashboardData() {
  return authenticatedBackendFetch<OwnerDashboardData>("/dashboard/owner")
}
