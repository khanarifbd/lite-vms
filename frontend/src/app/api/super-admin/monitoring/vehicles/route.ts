import { NextResponse } from "next/server"

import type { MonitoringVehicleCursorPage } from "@/features/super-admin/monitoring"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = url.searchParams.toString()

  try {
    const data = await authenticatedBackendFetch<MonitoringVehicleCursorPage>(
      `/admin/monitoring/vehicles${query ? `?${query}` : ""}`
    )
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { message: "Unable to load monitoring vehicles." },
      { status: 500 }
    )
  }
}
