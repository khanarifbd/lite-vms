import { NextResponse } from "next/server"

import type { AuthUser } from "@/lib/auth/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ identifierId: string }>
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { identifierId } = await params
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Updated identifier value is required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<AuthUser>(
      `/auth/me/identifiers/${encodeURIComponent(identifierId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to update the login identifier.")
  }
}

export async function DELETE(_: Request, { params }: RouteContext) {
  const { identifierId } = await params
  try {
    const result = await authenticatedBackendFetch<AuthUser>(
      `/auth/me/identifiers/${encodeURIComponent(identifierId)}`,
      { method: "DELETE" }
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to remove the login identifier.")
  }
}
