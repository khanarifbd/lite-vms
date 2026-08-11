import { NextResponse } from "next/server"
import { z } from "zod"

import { BackendApiError, authenticatedBackendFetch } from "@/lib/api/server"

const schema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid connection response." }, { status: 400 })
  }

  const { linkId } = await params
  try {
    const result = await authenticatedBackendFetch(`/drivers/links/${linkId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Driver connection service is unavailable." }, { status: 502 })
  }
}
