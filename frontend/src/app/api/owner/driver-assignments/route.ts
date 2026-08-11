import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const schema = z.object({
  vehicle_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  start_on_duty: z.boolean().default(false),
  notes: z.string().trim().min(3).max(1000),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Select a vehicle and enter an assignment note." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch("/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Driver assignment service is unavailable." }, { status: 502 })
  }
}
