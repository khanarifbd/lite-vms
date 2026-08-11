import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ driverId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { driverId } = await params
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Driver profile changes are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch(
      `/admin/drivers/${encodeURIComponent(driverId)}/profile`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to update the driver profile." }, { status: 500 })
  }
}
