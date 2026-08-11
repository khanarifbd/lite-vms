import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function POST(request: Request, context: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await context.params
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Review decision and note are required." }, { status: 400 })
  }
  try {
    return NextResponse.json(await authenticatedBackendFetch(
      `/admin/enforcement/national/review-queue/${candidateId}/decision`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ))
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to review this violation candidate." }, { status: 500 })
  }
}
