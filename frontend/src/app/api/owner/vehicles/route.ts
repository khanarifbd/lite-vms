import { NextResponse } from "next/server"

import type {
  ProviderVehicleRegistrationPayload,
  ProviderVehicleRegistrationResult,
} from "@/features/provider/vehicle-registration-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

function errorResponse(error: unknown) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: "Unable to register the vehicle." }, { status: 500 })
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as ProviderVehicleRegistrationPayload | null
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Vehicle registration details are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<ProviderVehicleRegistrationResult>(
      "/vehicles/owner-registration",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
