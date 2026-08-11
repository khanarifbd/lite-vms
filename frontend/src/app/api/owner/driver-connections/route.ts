import { NextResponse } from "next/server"
import { z } from "zod"

import type { OwnerDriverConnection } from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const schema = z.object({
  driver_id: z.string().uuid(),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Select a valid driver." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<{
      owner_link: OwnerDriverConnection
      message: string
    }>("/drivers/owner-links/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Driver connection service is unavailable." }, { status: 502 })
  }
}
