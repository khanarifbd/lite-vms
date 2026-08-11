import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const schema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a handover reason." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch(
      `/assignments/${encodeURIComponent(assignmentId)}/start-duty`,
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
    return NextResponse.json({ message: "Duty handover service is unavailable." }, { status: 502 })
  }
}
