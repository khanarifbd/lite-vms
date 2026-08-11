import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ driverId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  const { driverId } = await params
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Profile review details are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch(
      `/drivers/${encodeURIComponent(driverId)}/profile-change/review`,
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
    return NextResponse.json({ message: "Unable to review the Driver profile change." }, { status: 500 })
  }
}
