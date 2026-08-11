import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export type RegistrationOption = { value: string; label: string }
export type VehicleRegistrationOptions = {
  vehicle_types: RegistrationOption[]
  vehicle_categories: RegistrationOption[]
  usage_types: RegistrationOption[]
  body_types: RegistrationOption[]
  fuel_types: RegistrationOption[]
  colors: RegistrationOption[]
}

export async function GET() {
  try {
    const result = await authenticatedBackendFetch<VehicleRegistrationOptions>(
      "/settings/vehicle-registration-options"
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to load vehicle registration options." }, { status: 500 })
  }
}
