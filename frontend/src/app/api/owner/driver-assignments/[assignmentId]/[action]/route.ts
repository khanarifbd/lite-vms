import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const schema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string; action: string }> }
) {
  const { assignmentId, action } = await params
  if (!["start-duty", "end"].includes(action)) {
    return NextResponse.json({ message: "Unsupported driver roster action." }, { status: 404 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a reason of at least 3 characters." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch(
      `/assignments/${encodeURIComponent(assignmentId)}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "end"
            ? { notes: parsed.data.reason }
            : { reason: parsed.data.reason }
        ),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Driver roster service is unavailable." }, { status: 502 })
  }
}
