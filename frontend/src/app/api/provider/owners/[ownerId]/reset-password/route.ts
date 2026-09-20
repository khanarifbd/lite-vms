import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function POST(
  request: Request,
  context: { params: Promise<{ ownerId: string }> }
) {
  const { ownerId } = await context.params
  const body = (await request.json().catch(() => null)) as
    | { new_password?: unknown; reason?: unknown }
    | null
  if (
    typeof body?.new_password !== "string" ||
    body.new_password.length < 12 ||
    body.new_password.length > 128 ||
    typeof body.reason !== "string" ||
    body.reason.trim().length < 10 ||
    body.reason.length > 500
  ) {
    return NextResponse.json(
      { message: "A new owner password (12–128 characters) and support reason (10+ characters) are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  try {
    const result = await authenticatedBackendFetch<{ message: string }>(
      `/providers/me/owners/${encodeURIComponent(ownerId)}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_password: body.new_password,
          reason: body.reason.trim(),
        }),
      }
    )
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof BackendApiError ? error.message : "Unable to reset the owner password." },
      {
        status: error instanceof BackendApiError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      }
    )
  }
}
