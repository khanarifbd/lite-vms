import { NextResponse } from "next/server"

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
    return NextResponse.json(
      await authenticatedBackendFetch(`/vehicles/provider-registration/${vehicleId}/certificate`)
    )
  } catch (error) {
    return errorResponse(error, "Unable to load certificate status.")
  }
}

export async function POST(_: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  try {
    return NextResponse.json(
      await authenticatedBackendFetch(`/vehicles/provider-registration/${vehicleId}/certificate`, {
        method: "POST",
      })
    )
  } catch (error) {
    return errorResponse(error, "Unable to generate certificate.")
  }
}
