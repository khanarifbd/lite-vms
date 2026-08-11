import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"
import type { ApprovalQueueEntityType } from "@/features/approvals/types"

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
  notes: z.string().trim().max(2000).default(""),
  profile_change: z.boolean().default(false),
})

const entityPaths: Record<ApprovalQueueEntityType, string> = {
  provider: "providers",
  owner: "owners",
  vehicle: "vehicles",
  driver: "drivers",
  document: "admin/vehicle-documents",
}

type RouteContext = {
  params: Promise<{
    entityType: string
    id: string
  }>
}

export async function POST(request: Request, context: RouteContext) {
  const { entityType, id } = await context.params

  if (!(entityType in entityPaths) || !id) {
    return NextResponse.json({ message: "Invalid approval target." }, { status: 400 })
  }

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Invalid review decision." },
      { status: 400 }
    )
  }

  const type = entityType as ApprovalQueueEntityType
  const { decision, notes, profile_change: profileChange } = parsed.data
  const notesRequired = type !== "provider" || decision !== "approve"

  if (notesRequired && notes.length < 3) {
    return NextResponse.json(
      { message: "Review notes must contain at least 3 characters." },
      { status: 400 }
    )
  }

  try {
    const reviewPath =
      type === "driver" && profileChange
        ? `/drivers/${encodeURIComponent(id)}/profile-change/review`
        : type === "document"
          ? `/admin/vehicle-documents/${encodeURIComponent(id)}/review`
          : `/${entityPaths[type]}/${encodeURIComponent(id)}/review`
    const result = await authenticatedBackendFetch<unknown>(reviewPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision,
        notes: notes || null,
      }),
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }

    return NextResponse.json(
      { message: "Unable to submit the review decision." },
      { status: 500 }
    )
  }
}
