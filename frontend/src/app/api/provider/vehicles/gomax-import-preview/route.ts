import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET(request: Request) {
  const ownerId = new URL(request.url).searchParams.get("owner_id")
  if (!ownerId) {
    return NextResponse.json({ message: "Owner selection is required." }, { status: 400 })
  }
  try {
    const result = await authenticatedBackendFetch(
      `/vehicles/provider-registration/gomax-import/preview?owner_id=${encodeURIComponent(ownerId)}`
    )
    return NextResponse.json(result)
  } catch (error) {
    const status = error instanceof BackendApiError ? error.status : 500
    const message = error instanceof BackendApiError ? error.message : "Unable to load Go Max vehicles."
    return NextResponse.json({ message }, { status })
  }
}
