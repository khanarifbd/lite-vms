"use client"

import {
  VehicleRegistrationForm,
  type VehicleRegistrationOwnerOption,
} from "@/components/vehicle/vehicle-registration-form"

export type ProviderVehicleOwnerOption = VehicleRegistrationOwnerOption

type ProviderVehicleRegistrationFormProps = {
  owners: ProviderVehicleOwnerOption[]
}

export function ProviderVehicleRegistrationForm({ owners }: ProviderVehicleRegistrationFormProps) {
  return (
    <VehicleRegistrationForm
      mode="provider"
      apiBase="/api/provider/vehicles"
      registryHref="/provider/vehicles"
      owners={owners}
    />
  )
}
