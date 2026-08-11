import { NextRequest, NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export type IdentifierAvailabilityResult = {
  identifier_type: "email" | "mobile" | "username"
  normalized_value: string
  available: boolean
  message: string
}

export async function GET(request: NextRequest) {
  const identifierType = request.nextUrl.searchParams.get("identifier_type")
  const value = request.nextUrl.searchParams.get("value")
  const excludeIdentifierId = request.nextUrl.searchParams.get("exclude_identifier_public_id")

  if (!identifierType || !value) {
    return NextResponse.json(
      { message: "Identifier type and value are required." },
      { status: 400 }
    )
  }

  const params = new URLSearchParams({
    identifier_type: identifierType,
    value,
  })
  if (excludeIdentifierId) {
    params.set("exclude_identifier_public_id", excludeIdentifierId)
  }

  try {
    const result = await authenticatedBackendFetch<IdentifierAvailabilityResult>(
      `/auth/me/identifiers/availability?${params.toString()}`
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { message: "Unable to check login identifier availability." },
      { status: 500 }
    )
  }
}
