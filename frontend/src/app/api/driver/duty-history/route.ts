import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams
  const params = new URLSearchParams({
    offset: incoming.get("offset") || "0",
    limit: incoming.get("limit") || "50",
  })
  for (const key of ["from_at", "to_at"]) {
    const value = incoming.get(key)
    if (value) params.set(key, value)
  }

  try {
    const result = await authenticatedBackendFetch(
      `/assignments/duty-history?${params.toString()}`
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Duty history service is unavailable." }, { status: 502 })
  }
}
