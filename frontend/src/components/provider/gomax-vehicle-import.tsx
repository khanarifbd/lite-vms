"use client"

import { GoMaxVehicleImportV2 } from "@/components/provider/gomax-vehicle-import-v2"
import type { ProviderVehicleOwnerOption } from "@/components/provider/provider-vehicle-registration-form"

export function GoMaxVehicleImport({ owners }: { owners: ProviderVehicleOwnerOption[] }) {
  return <GoMaxVehicleImportV2 owners={owners} />
}
