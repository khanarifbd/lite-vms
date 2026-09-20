import { NextResponse } from "next/server"

import type { OwnerConnectionVehicle } from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

// Vehicle access choices are fetched on demand, never with the owner workspace.
export async function GET() {
  try {
    const vehicles = await authenticatedBackendFetch<OwnerConnectionVehicle[]>(
      "/owners/me/provider-connections/vehicles"
    )
    return NextResponse.json(vehicles, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof BackendApiError ? error.message : "Unable to load owner vehicles." },
      { status: error instanceof BackendApiError ? error.status : 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
