import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = { params: Promise<{ path: string[] }> }

async function proxy(request: Request, context: RouteContext) {
  const { path } = await context.params
  const url = new URL(request.url)
  const backendPath = `/admin/enforcement/${path.join("/")}${url.search}`
  const hasBody = !["GET", "HEAD"].includes(request.method)
  const body = hasBody ? await request.text() : undefined

  try {
    const result = await authenticatedBackendFetch(backendPath, {
      method: request.method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body || undefined,
    })
    return ["PATCH", "DELETE"].includes(request.method)
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to process enforcement configuration." }, { status: 500 })
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
