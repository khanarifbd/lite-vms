import { NextResponse } from "next/server"

import type { ProviderVehicleDetails } from "@/features/provider/vehicle-detail-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ vehicleId: string }>
}

export async function POST(_: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  if (!vehicleId) {
    return NextResponse.json({ message: "Vehicle ID is required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<ProviderVehicleDetails>(
      `/vehicles/provider-registration/${vehicleId}/submit`,
      { method: "POST" }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to submit the vehicle registration." }, { status: 500 })
  }
}
