import { NextResponse } from "next/server"

import type { AuthUser } from "@/lib/auth/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Account settings are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<AuthUser>("/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to update account settings." }, { status: 500 })
  }
}
