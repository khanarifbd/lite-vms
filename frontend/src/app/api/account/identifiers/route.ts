import { NextResponse } from "next/server"

import type { AuthUser } from "@/lib/auth/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Login identifier details are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<AuthUser>("/auth/me/identifiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error, "Unable to add the login identifier.")
  }
}
