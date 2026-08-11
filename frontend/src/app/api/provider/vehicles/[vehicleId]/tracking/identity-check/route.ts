import { NextResponse } from "next/server"

import type { ProviderDeviceIdentityAvailability } from "@/features/provider/vehicle-tracking-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ vehicleId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  const source = new URL(request.url)
  const params = new URLSearchParams()
  for (const key of ["device_identifier", "imei", "exclude_device_id"]) {
    const value = source.searchParams.get(key)
    if (value) params.set(key, value)
  }
  if (!params.has("device_identifier") && !params.has("imei")) {
    return NextResponse.json(
      { message: "Provide a device identifier or IMEI." },
      { status: 400 }
    )
  }

  try {
    const result = await authenticatedBackendFetch<ProviderDeviceIdentityAvailability>(
      `/vehicles/provider-registration/${vehicleId}/tracking/identity-check?${params.toString()}`
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to validate GPS identity." }, { status: 500 })
  }
}
