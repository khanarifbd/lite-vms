import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const schema = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
  notes: z.string().trim().max(2000).default(""),
})

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context) {
  const { id } = await context.params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!id || !parsed.success) {
    return NextResponse.json({ message: "Invalid driver review decision." }, { status: 400 })
  }

  const { decision, notes } = parsed.data
  if (notes.length < 3) {
    return NextResponse.json(
      { message: "Driver review notes must contain at least 3 characters." },
      { status: 400 }
    )
  }

  try {
    const result = await authenticatedBackendFetch(
      `/drivers/${encodeURIComponent(id)}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes }),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { message: "Unable to submit the driver review decision." },
      { status: 500 }
    )
  }
}
