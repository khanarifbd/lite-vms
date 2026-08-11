import { NextResponse } from "next/server"

import type { VehicleDetails, VehicleUpdatePayload } from "@/features/vehicles/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ vehicleId: string }>
}

function errorResponse(error: unknown) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: "Unable to update the vehicle." }, { status: 500 })
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { vehicleId } = await params
  const payload = (await request.json().catch(() => null)) as VehicleUpdatePayload | null
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Vehicle changes are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<VehicleDetails>(
      `/vehicles/owner-registration/${vehicleId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
