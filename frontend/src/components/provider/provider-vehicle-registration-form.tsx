"use client"

import { ProviderVehicleRegistrationFormV2 } from "@/components/provider/provider-vehicle-registration-form-v2"
import type { VehicleRegistrationOwnerOption } from "@/components/vehicle/vehicle-registration-form"

export type ProviderVehicleOwnerOption = VehicleRegistrationOwnerOption

type ProviderVehicleRegistrationFormProps = {
  owners: ProviderVehicleOwnerOption[]
}

export function ProviderVehicleRegistrationForm({ owners }: ProviderVehicleRegistrationFormProps) {
  return <ProviderVehicleRegistrationFormV2 owners={owners} />
}
