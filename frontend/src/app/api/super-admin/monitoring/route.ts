import { NextResponse } from "next/server"

import type { NationalMonitoringDashboard } from "@/features/super-admin/monitoring"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET() {
  try {
    const data = await authenticatedBackendFetch<NationalMonitoringDashboard>(
      "/admin/monitoring"
    )
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { message: "Unable to load national monitoring data." },
      { status: 500 }
    )
  }
}
