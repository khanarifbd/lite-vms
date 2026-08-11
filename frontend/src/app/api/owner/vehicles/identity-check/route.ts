import { NextRequest, NextResponse } from "next/server"

import type { VehicleIdentityAvailability } from "@/features/provider/vehicle-registration-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET(request: NextRequest) {
  const params = new URLSearchParams()
  for (const key of ["registration_number", "chassis_number", "engine_number", "exclude_vehicle_id"]) {
    const value = request.nextUrl.searchParams.get(key)
    if (value) params.set(key, value)
  }

  try {
    const result = await authenticatedBackendFetch<VehicleIdentityAvailability>(
      `/vehicles/owner-registration/identity-check?${params.toString()}`
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to validate vehicle identity." }, { status: 500 })
  }
}
