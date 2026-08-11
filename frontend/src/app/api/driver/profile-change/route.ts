import { NextResponse } from "next/server"

import { BackendApiError, authenticatedBackendFetch } from "@/lib/api/server"

function errorResponse(error: unknown) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: "Driver service is unavailable." }, { status: 502 })
}

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const profile = await authenticatedBackendFetch("/drivers/me/profile-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return NextResponse.json(profile)
  } catch (error) {
    return errorResponse(error)
  }
}
