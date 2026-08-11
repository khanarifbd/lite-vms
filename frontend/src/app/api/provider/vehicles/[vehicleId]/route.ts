import { NextResponse } from "next/server"

import type {
  ProviderVehicleDetails,
  ProviderVehicleUpdatePayload,
} from "@/features/provider/vehicle-detail-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ vehicleId: string }>
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function GET(_: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  if (!vehicleId) {
    return NextResponse.json({ message: "Vehicle ID is required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<ProviderVehicleDetails>(
      `/vehicles/provider-registration/${vehicleId}`
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to load vehicle details.")
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  if (!vehicleId) {
    return NextResponse.json({ message: "Vehicle ID is required." }, { status: 400 })
  }

  const payload = (await request.json().catch(() => null)) as ProviderVehicleUpdatePayload | null
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Vehicle changes are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<ProviderVehicleDetails>(
      `/vehicles/provider-registration/${vehicleId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to update the vehicle.")
  }
}
