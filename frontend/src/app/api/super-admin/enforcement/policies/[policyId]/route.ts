import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function PUT(
  request: Request,
  context: { params: Promise<{ policyId: string }> },
) {
  const { policyId } = await context.params
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Policy payload is required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch(`/admin/enforcement/policies/${policyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to update enforcement policy." }, { status: 500 })
  }
}
