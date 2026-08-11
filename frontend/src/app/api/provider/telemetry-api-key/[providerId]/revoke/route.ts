import { NextResponse } from "next/server"

import type { ProviderTelemetryApiKeyStatus } from "@/features/provider/telemetry-api-key-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ providerId: string }>
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function POST(request: Request, context: RouteContext) {
  const { providerId } = await context.params
  if (!providerId) {
    return NextResponse.json({ message: "Provider ID is required." }, { status: 400 })
  }

  const payload = (await request.json().catch(() => null)) as { note?: string } | null
  const note = payload?.note?.trim()
  if (!note || note.length < 3) {
    return NextResponse.json(
      { message: "A revocation reason of at least 3 characters is required." },
      { status: 400 }
    )
  }

  try {
    const result = await authenticatedBackendFetch<ProviderTelemetryApiKeyStatus>(
      `/providers/${providerId}/telemetry-api-key/revoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to revoke the telemetry API key.")
  }
}
