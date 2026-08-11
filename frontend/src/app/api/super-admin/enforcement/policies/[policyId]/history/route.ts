import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET(
  _request: Request,
  context: { params: Promise<{ policyId: string }> },
) {
  const { policyId } = await context.params
  try {
    return NextResponse.json(
      await authenticatedBackendFetch(`/admin/enforcement/policies/${policyId}/history`),
    )
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to load policy history." }, { status: 500 })
  }
}
