import { NextResponse } from "next/server"

import type { ProviderApplication } from "@/features/provider/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Provider settings are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<ProviderApplication>("/providers/me/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to update provider settings.")
  }
}
