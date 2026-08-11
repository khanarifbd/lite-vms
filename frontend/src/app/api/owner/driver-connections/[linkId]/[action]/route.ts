import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const responseSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().max(1000).optional().nullable(),
}).superRefine((value, context) => {
  if (value.decision === "reject" && (!value.notes || value.notes.length < 3)) {
    context.addIssue({ code: "custom", path: ["notes"], message: "Rejection reason is required." })
  }
})

const unlinkSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ linkId: string; action: string }> }
) {
  const { linkId, action } = await params
  if (!["respond", "unlink"].includes(action)) {
    return NextResponse.json({ message: "Unsupported driver connection action." }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const parsed = action === "respond" ? responseSchema.safeParse(body) : unlinkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ message: "A valid decision and reason are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch(
      `/drivers/owner-links/${encodeURIComponent(linkId)}/${action}`,
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
    return NextResponse.json({ message: "Driver connection service is unavailable." }, { status: 502 })
  }
}
