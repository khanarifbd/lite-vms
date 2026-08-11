import { NextResponse } from "next/server"

import type { OwnerApplication, OwnerProfileUpdatePayload } from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

function errorResponse(error: unknown) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: "Unable to update the owner profile." }, { status: 500 })
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as OwnerProfileUpdatePayload | null
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Updated owner details are required." }, { status: 400 })
  }

  try {
    const owner = await authenticatedBackendFetch<OwnerApplication>("/owners/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return NextResponse.json(owner)
  } catch (error) {
    return errorResponse(error)
  }
}
