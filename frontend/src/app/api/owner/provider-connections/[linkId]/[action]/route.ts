import { NextResponse } from "next/server"

import type { OwnerProviderConnection } from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ linkId: string; action: string }>
}

const allowedActions = new Set(["respond", "cancel", "disconnect", "vehicle-scope"])

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

async function forward(request: Request, context: RouteContext, method: "POST" | "PUT") {
  const { linkId, action } = await context.params
  if (!allowedActions.has(action)) {
    return NextResponse.json({ message: "Unsupported provider connection action." }, { status: 404 })
  }
  if (action === "vehicle-scope" && method !== "PUT") {
    return NextResponse.json({ message: "Vehicle scope updates require PUT." }, { status: 405 })
  }
  if (action !== "vehicle-scope" && method !== "POST") {
    return NextResponse.json({ message: "This action requires POST." }, { status: 405 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Action details are required." }, { status: 400 })
  }

  try {
    const connection = await authenticatedBackendFetch<OwnerProviderConnection>(
      `/owners/me/provider-connections/${encodeURIComponent(linkId)}/${action}`,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(connection)
  } catch (error) {
    return errorResponse(error, "Unable to update provider access.")
  }
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context, "POST")
}

export async function PUT(request: Request, context: RouteContext) {
  return forward(request, context, "PUT")
}
