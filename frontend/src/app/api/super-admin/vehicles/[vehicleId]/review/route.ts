import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = { params: Promise<{ vehicleId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const { vehicleId } = await params
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Vehicle review details are required." }, { status: 400 })
  }
  try {
    const result = await authenticatedBackendFetch(
      `/admin/vehicles/${encodeURIComponent(vehicleId)}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to review vehicle." }, { status: 500 })
  }
}
