import "server-only"

import type { ProviderVehicleTrackingWorkspace } from "@/features/provider/vehicle-tracking-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getProviderVehicleTracking(vehicleId: string) {
  return authenticatedBackendFetch<ProviderVehicleTrackingWorkspace>(
    `/vehicles/provider-registration/${vehicleId}/tracking`
  )
}
