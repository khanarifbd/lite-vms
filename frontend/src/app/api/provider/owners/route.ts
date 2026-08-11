import { NextResponse } from "next/server"

import type {
  ProviderOwnerPage,
  ProviderOwnerRegistrationPayload,
  ProviderOwnerRegistrationResult,
} from "@/features/provider/owner-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function GET(request: Request) {
  const source = new URL(request.url)
  const target = new URLSearchParams()

  for (const key of ["search", "status", "offset", "limit"]) {
    const value = source.searchParams.get(key)
    if (value) {
      target.set(key, value)
    }
  }

  try {
    const suffix = target.size ? `?${target.toString()}` : ""
    const result = await authenticatedBackendFetch<ProviderOwnerPage>(
      `/providers/me/owners${suffix}`
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to load vehicle owners.")
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as ProviderOwnerRegistrationPayload | null

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Owner registration details are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<ProviderOwnerRegistrationResult>(
      "/owners/provider-register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error, "Unable to register or link the vehicle owner.")
  }
}
