import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    owner_type?: "individual" | "company"
    mobile?: string
  } | null

  if (!payload?.owner_type || !payload.mobile?.trim()) {
    return NextResponse.json({ message: "Owner type and mobile number are required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch("/owners/mobile-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_type: payload.owner_type, mobile: payload.mobile.trim() }),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to search the owner registry." }, { status: 500 })
  }
}
