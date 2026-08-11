import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = await request.text()
    const result = await authenticatedBackendFetch(`/admin/organizations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) return NextResponse.json({ message: error.message }, { status: error.status })
    return NextResponse.json({ message: "Unable to update organization." }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = await request.text()
    await authenticatedBackendFetch(`/admin/organizations/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body,
    })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof BackendApiError) return NextResponse.json({ message: error.message }, { status: error.status })
    return NextResponse.json({ message: "Unable to delete organization." }, { status: 500 })
  }
}
