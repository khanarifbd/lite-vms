import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = { params: Promise<{ vehicleId: string }> }

export async function GET(_: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  try {
    return NextResponse.json(
      await authenticatedBackendFetch(`/vehicles/owner-registration/${encodeURIComponent(vehicleId)}/certificate`)
    )
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to load certificate status." }, { status: 500 })
  }
}
