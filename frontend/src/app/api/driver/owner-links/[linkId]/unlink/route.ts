import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const schema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a reason of at least 3 characters." }, { status: 400 })
  }

  const { linkId } = await params
  try {
    const result = await authenticatedBackendFetch(
      `/drivers/owner-links/${encodeURIComponent(linkId)}/unlink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Owner connection service is unavailable." }, { status: 502 })
  }
}
