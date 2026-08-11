import { NextResponse } from "next/server"

import type { OwnerLookupResult, OwnerType } from "@/features/provider/owner-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    owner_type?: OwnerType
    identity_or_registration_reference?: string
  } | null

  if (!payload?.owner_type || !payload.identity_or_registration_reference?.trim()) {
    return NextResponse.json(
      { message: "Owner type and identity reference are required." },
      { status: 400 }
    )
  }

  try {
    const result = await authenticatedBackendFetch<OwnerLookupResult>("/owners/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_type: payload.owner_type,
        identity_or_registration_reference: payload.identity_or_registration_reference.trim(),
      }),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to search the owner registry." }, { status: 500 })
  }
}
