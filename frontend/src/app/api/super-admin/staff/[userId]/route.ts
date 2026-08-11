import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type Context = { params: Promise<{ userId: string }> }

export async function PATCH(request: Request, { params }: Context) {
  const { userId } = await params
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Update details are required." }, { status: 400 })
  }
  try {
    return NextResponse.json(
      await authenticatedBackendFetch(`/admin/staff/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    )
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to update staff account." }, { status: 500 })
  }
}
