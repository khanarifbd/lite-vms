import { NextResponse } from "next/server"

import type {
  ProviderDeviceAssignmentPayload,
  ProviderVehicleTrackingAssignment,
  ProviderVehicleTrackingWorkspace,
} from "@/features/provider/vehicle-tracking-types"
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
  try {
    const result = await authenticatedBackendFetch<ProviderVehicleTrackingWorkspace>(
      `/vehicles/provider-registration/${vehicleId}/tracking`
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to load GPS device assignments.")
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  const payload = (await request.json().catch(() => null)) as ProviderDeviceAssignmentPayload | null
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "GPS device details are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<ProviderVehicleTrackingAssignment>(
      `/vehicles/provider-registration/${vehicleId}/tracking/assign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error, "Unable to assign the GPS device.")
  }
}
