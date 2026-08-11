import "server-only"

import type { ProviderVehicleDriverWorkspace } from "@/features/provider/vehicle-driver-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getOwnerVehicleDrivers(vehicleId: string) {
  return authenticatedBackendFetch<ProviderVehicleDriverWorkspace>(
    `/vehicles/owner-registration/${encodeURIComponent(vehicleId)}/drivers`
  )
}
