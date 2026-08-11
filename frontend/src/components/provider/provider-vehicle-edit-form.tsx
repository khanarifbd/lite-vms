"use client"

import { VehicleEditForm } from "@/components/vehicle/vehicle-edit-form"
import type { ProviderVehicleDetails } from "@/features/provider/vehicle-detail-types"

type ProviderVehicleEditFormProps = {
  vehicle: ProviderVehicleDetails
}

export function ProviderVehicleEditForm({ vehicle }: ProviderVehicleEditFormProps) {
  return (
    <VehicleEditForm
      vehicle={vehicle}
      apiBase="/api/provider/vehicles"
      detailsBase="/provider/vehicles"
      mode="provider"
    />
  )
}
