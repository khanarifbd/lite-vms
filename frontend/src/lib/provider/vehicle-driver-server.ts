import "server-only"

import type { ProviderVehicleDriverWorkspace } from "@/features/provider/vehicle-driver-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getProviderVehicleDrivers(vehicleId: string) {
  return authenticatedBackendFetch<ProviderVehicleDriverWorkspace>(
    `/vehicles/provider-registration/${encodeURIComponent(vehicleId)}/drivers`
  )
}
