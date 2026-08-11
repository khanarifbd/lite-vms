import { NextResponse } from "next/server"

import type { OwnerProviderLink } from "@/features/provider/owner-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function POST(
  request: Request,
  context: { params: Promise<{ linkId: string }> }
) {
  const { linkId } = await context.params
  const payload = (await request.json().catch(() => null)) as {
    decision?: "approve" | "reject"
    notes?: string | null
  } | null

  if (!payload?.decision || !["approve", "reject"].includes(payload.decision)) {
    return NextResponse.json({ message: "Select a valid link decision." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<OwnerProviderLink>(
      `/owners/provider-links/${encodeURIComponent(linkId)}/respond`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: payload.decision,
          notes: payload.notes?.trim() || null,
        }),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to update the provider-owner link." }, { status: 500 })
  }
}
