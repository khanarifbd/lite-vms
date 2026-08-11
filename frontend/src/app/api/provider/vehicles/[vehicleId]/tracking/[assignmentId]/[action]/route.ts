import { NextResponse } from "next/server"

import type { ProviderVehicleTrackingAssignment } from "@/features/provider/vehicle-tracking-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ vehicleId: string; assignmentId: string; action: string }>
}

const allowedActions = new Set(["confirm", "test", "activate"])

export async function POST(request: Request, context: RouteContext) {
  const { vehicleId, assignmentId, action } = await context.params
  if (!allowedActions.has(action)) {
    return NextResponse.json({ message: "Unsupported GPS workflow action." }, { status: 404 })
  }

  const rawBody = await request.text()
  try {
    const result = await authenticatedBackendFetch<ProviderVehicleTrackingAssignment>(
      `/vehicles/provider-registration/${vehicleId}/tracking/${assignmentId}/${action}`,
      {
        method: "POST",
        headers: rawBody ? { "Content-Type": "application/json" } : undefined,
        body: rawBody || undefined,
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to update the GPS assignment." }, { status: 500 })
  }
}
