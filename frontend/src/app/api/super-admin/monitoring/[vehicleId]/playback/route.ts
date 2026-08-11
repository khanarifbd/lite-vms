import { NextResponse } from "next/server"

import type { MonitoringPlayback } from "@/features/super-admin/monitoring"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = { params: Promise<{ vehicleId: string }> }

export const dynamic = "force-dynamic"
export const revalidate = 0

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
}

export async function GET(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  const requestUrl = new URL(request.url)
  const startAt = requestUrl.searchParams.get("start_at")
  const endAt = requestUrl.searchParams.get("end_at")

  if (!startAt || !endAt) {
    return NextResponse.json(
      { message: "Playback start and end time are required." },
      { status: 422, headers: NO_STORE_HEADERS },
    )
  }

  const query = new URLSearchParams({ start_at: startAt, end_at: endAt })
  const limit = requestUrl.searchParams.get("limit")
  if (limit) query.set("limit", limit)

  try {
    const data = await authenticatedBackendFetch<MonitoringPlayback>(
      `/admin/monitoring/vehicles/${encodeURIComponent(vehicleId)}/playback?${query.toString()}`,
    )
    return NextResponse.json(data, { headers: NO_STORE_HEADERS })
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status, headers: NO_STORE_HEADERS },
      )
    }
    return NextResponse.json(
      { message: "Unable to load vehicle playback history." },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}
