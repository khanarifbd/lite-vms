import { NextResponse } from "next/server"

import type { ProviderVehicleRegistrationResult } from "@/features/provider/vehicle-registration-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ vehicleId: string }>
}

export async function POST(_: Request, { params }: RouteContext) {
  const { vehicleId } = await params
  try {
    const result = await authenticatedBackendFetch<ProviderVehicleRegistrationResult>(
      `/vehicles/owner-registration/${vehicleId}/submit`,
      { method: "POST" }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to submit the vehicle draft." }, { status: 500 })
  }
}
