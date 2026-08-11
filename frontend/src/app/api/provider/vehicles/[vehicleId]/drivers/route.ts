import { NextResponse } from "next/server"

import type { ProviderVehicleDriverWorkspace } from "@/features/provider/vehicle-driver-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = { params: Promise<{ vehicleId: string }> }

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function GET(_: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  try {
    const result = await authenticatedBackendFetch<ProviderVehicleDriverWorkspace>(
      `/vehicles/provider-registration/${encodeURIComponent(vehicleId)}/drivers`
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to load linked drivers.")
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Driver assignment details are required." }, { status: 400 })
  }
  try {
    const result = await authenticatedBackendFetch(
      `/vehicles/provider-registration/${encodeURIComponent(vehicleId)}/drivers/assign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error, "Unable to assign the driver.")
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  const payload = (await request.json().catch(() => null)) as
    | { assignment_id?: string; notes?: string }
    | null
  if (!payload?.assignment_id) {
    return NextResponse.json({ message: "Assignment ID is required." }, { status: 400 })
  }
  if (!payload.notes || payload.notes.trim().length < 3) {
    return NextResponse.json({ message: "A reason of at least 3 characters is required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch(
      `/vehicles/provider-registration/${encodeURIComponent(vehicleId)}/drivers/${encodeURIComponent(payload.assignment_id)}/end`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: payload.notes.trim() }),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to unassign the driver.")
  }
}
