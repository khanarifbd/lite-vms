import { NextResponse } from "next/server"
import { z } from "zod"

import type { OwnerProviderLink } from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const responseSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().max(1000).optional().default(""),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ linkId: string }> }
) {
  const parsed = responseSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Select a valid response." }, { status: 400 })
  }

  const { linkId } = await context.params

  try {
    const link = await authenticatedBackendFetch<OwnerProviderLink>(
      `/owners/provider-links/${encodeURIComponent(linkId)}/respond`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: parsed.data.decision,
          notes: parsed.data.notes || null,
        }),
      }
    )
    return NextResponse.json(link)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to respond to the provider request." }, { status: 500 })
  }
}
