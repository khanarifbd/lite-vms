import { NextResponse } from "next/server"

import type { MonitoringVehicleDetail } from "@/features/super-admin/monitoring"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET(
  _request: Request,
  context: { params: Promise<{ vehicleId: string }> }
) {
  const { vehicleId } = await context.params

  try {
    const data = await authenticatedBackendFetch<MonitoringVehicleDetail>(
      `/admin/monitoring/vehicles/${encodeURIComponent(vehicleId)}/details`
    )
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { message: "Unable to load vehicle details." },
      { status: 500 }
    )
  }
}
