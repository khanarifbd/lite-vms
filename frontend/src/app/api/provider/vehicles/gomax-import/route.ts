import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.owner_id !== "string") {
    return NextResponse.json({ message: "Owner selection is required." }, { status: 400 })
  }
  try {
    const result = await authenticatedBackendFetch(`/vehicles/provider-registration/gomax-import?owner_id=${encodeURIComponent(body.owner_id)}`, { method: "POST" })
    return NextResponse.json(result)
  } catch (error) {
    const status = error instanceof BackendApiError ? error.status : 500
    const message = error instanceof BackendApiError ? error.message : "Unable to import Go Max vehicles."
    return NextResponse.json({ message }, { status })
  }
}
