import { NextResponse } from "next/server"

import type { VehicleIdentityAvailability } from "@/features/provider/vehicle-registration-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET(request: Request) {
  const source = new URL(request.url)
  const target = new URLSearchParams()
  for (const key of [
    "registration_number",
    "chassis_number",
    "engine_number",
    "exclude_vehicle_id",
  ]) {
    const value = source.searchParams.get(key)
    if (value) target.set(key, value)
  }

  if (
    !target.has("registration_number") &&
    !target.has("chassis_number") &&
    !target.has("engine_number")
  ) {
    return NextResponse.json({ message: "Provide at least one vehicle identity." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<VehicleIdentityAvailability>(
      `/vehicles/provider-registration/identity-check?${target.toString()}`
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to validate vehicle identity." }, { status: 500 })
  }
}
