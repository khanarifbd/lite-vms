import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = { params: Promise<{ assignmentId: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  const { assignmentId } = await context.params
  const payload = await request.json().catch(() => null)
  const notes =
    payload && typeof payload === "object" && "notes" in payload
      ? String(payload.notes || "").trim()
      : ""

  if (notes.length < 3) {
    return NextResponse.json(
      { message: "An unassignment note of at least 3 characters is required." },
      { status: 400 }
    )
  }

  try {
    const result = await authenticatedBackendFetch(
      `/assignments/${encodeURIComponent(assignmentId)}/end`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { message: "Unable to leave the vehicle assignment." },
      { status: 500 }
    )
  }
}
