import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = await request.text()
    const result = await authenticatedBackendFetch(`/admin/organizations/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) return NextResponse.json({ message: error.message }, { status: error.status })
    return NextResponse.json({ message: "Unable to change organization status." }, { status: 500 })
  }
}
