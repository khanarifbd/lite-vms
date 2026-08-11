import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = { params: Promise<{ candidateId: string }> }

export async function GET(_: Request, context: RouteContext) {
  const { candidateId } = await context.params
  try {
    const result = await authenticatedBackendFetch(
      `/admin/enforcement/national/review-queue/${encodeURIComponent(candidateId)}/driver`
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to load incident driver." }, { status: 500 })
  }
}
