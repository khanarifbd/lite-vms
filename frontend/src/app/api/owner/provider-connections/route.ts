import { NextResponse } from "next/server"

import type {
  OwnerProviderConnection,
  OwnerProviderConnectionWorkspace,
} from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function GET() {
  try {
    const workspace = await authenticatedBackendFetch<OwnerProviderConnectionWorkspace>(
      "/owners/me/provider-connections"
    )
    return NextResponse.json(workspace)
  } catch (error) {
    return errorResponse(error, "Unable to load provider connections.")
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Provider request details are required." }, { status: 400 })
  }

  try {
    const connection = await authenticatedBackendFetch<OwnerProviderConnection>(
      "/owners/me/provider-connections/request",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(connection, { status: 201 })
  } catch (error) {
    return errorResponse(error, "Unable to request the provider connection.")
  }
}
