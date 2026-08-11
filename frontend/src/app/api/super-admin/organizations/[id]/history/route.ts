import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const result = await authenticatedBackendFetch(`/admin/organizations/${id}/history`)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) return NextResponse.json({ message: error.message }, { status: error.status })
    return NextResponse.json({ message: "Unable to load organization history." }, { status: 500 })
  }
}
