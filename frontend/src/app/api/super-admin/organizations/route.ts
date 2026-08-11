import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).search
    const result = await authenticatedBackendFetch(`/admin/organizations${query}`)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) return NextResponse.json({ message: error.message }, { status: error.status })
    return NextResponse.json({ message: "Unable to load organizations." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const result = await authenticatedBackendFetch("/admin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof BackendApiError) return NextResponse.json({ message: error.message }, { status: error.status })
    return NextResponse.json({ message: "Unable to create organization." }, { status: 500 })
  }
}
