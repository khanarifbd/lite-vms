import { NextResponse } from "next/server"
import { z } from "zod"

import type { OwnerProviderLink } from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const unlinkSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ linkId: string }> }
) {
  const parsed = unlinkSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Enter a reason containing at least 3 characters." },
      { status: 400 }
    )
  }

  const { linkId } = await context.params

  try {
    const link = await authenticatedBackendFetch<OwnerProviderLink>(
      `/owners/provider-links/${encodeURIComponent(linkId)}/unlink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      }
    )
    return NextResponse.json(link)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to disconnect the provider." }, { status: 500 })
  }
}
