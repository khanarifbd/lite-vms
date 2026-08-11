import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const schema = z.object({
  owner_code: z.string().trim().min(3).max(40),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a valid vehicle-owner code." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch("/drivers/owner-links/driver-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Owner connection service is unavailable." }, { status: 502 })
  }
}
