import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type Payload = {
  owner_id: string
  project_ids?: string[]
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null
  if (!payload || typeof payload.owner_id !== "string") {
    return NextResponse.json({ message: "Owner selection is required." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch(
      "/vehicles/provider-registration/gomax-import/execute",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to import Go Max vehicles." }, { status: 500 })
  }
}
