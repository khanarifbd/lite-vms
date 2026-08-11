import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ entityType: string; entityId: string }>
}

const allowedEntityTypes = new Set(["provider", "owner", "driver"])

export async function POST(request: Request, { params }: RouteContext) {
  const { entityType, entityId } = await params
  if (!allowedEntityTypes.has(entityType) || !entityId) {
    return NextResponse.json({ message: "Account target is invalid." }, { status: 400 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Password reset details are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<{ message: string }>(
      `/admin/accounts/${entityType}/${encodeURIComponent(entityId)}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to reset the account password." }, { status: 500 })
  }
}
