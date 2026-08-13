"use client"

import { ProviderVehicleEditFormV2 } from "@/components/provider/provider-vehicle-edit-form-v2"
import type { ProviderVehicleDetails } from "@/features/provider/vehicle-detail-types"

type ProviderVehicleEditFormProps = {
  vehicle: ProviderVehicleDetails
}

export function ProviderVehicleEditForm({ vehicle }: ProviderVehicleEditFormProps) {
  return <ProviderVehicleEditFormV2 vehicle={vehicle} />
}
