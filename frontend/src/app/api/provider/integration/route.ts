import { NextResponse } from "next/server"

import type { ProviderApplication } from "@/features/provider/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function GET() {
  try {
    const result = await authenticatedBackendFetch<ProviderApplication>("/providers/me/integration")
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to load telemetry integration status.")
  }
}
