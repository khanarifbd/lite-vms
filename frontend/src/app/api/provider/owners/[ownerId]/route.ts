import { NextResponse } from "next/server"

import type { ProviderOwnerCustomer } from "@/features/provider/owner-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ ownerId: string }> }
) {
  const { ownerId } = await context.params

  try {
    const result = await authenticatedBackendFetch<ProviderOwnerCustomer>(
      `/providers/me/owners/${encodeURIComponent(ownerId)}`
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to load the vehicle owner.")
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ ownerId: string }> }
) {
  const { ownerId } = await context.params
  const payload = await request.json().catch(() => null)

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Updated owner details are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch(
      `/providers/me/owners/${encodeURIComponent(ownerId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to update the vehicle owner.")
  }
}
