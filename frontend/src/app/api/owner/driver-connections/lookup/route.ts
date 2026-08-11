import { NextResponse } from "next/server"
import { z } from "zod"

import type { OwnerDriverLookupResult } from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const schema = z.object({
  nid_reference: z.string().trim().min(10).max(120),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a valid driver NID reference." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<OwnerDriverLookupResult>(
      "/drivers/owner-links/lookup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Driver lookup service is unavailable." }, { status: 502 })
  }
}
