import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME } from "@/lib/auth/cookies"

type RouteContext = {
  params: Promise<{ vehicleId: string; documentId: string }>
}

function backendMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) {
    return "Unable to download the vehicle document."
  }
  const detail = payload.detail
  if (typeof detail === "string") return detail
  if (detail && typeof detail === "object" && "message" in detail) {
    return String(detail.message)
  }
  return "Unable to download the vehicle document."
}

export async function GET(_: Request, context: RouteContext) {
  const { vehicleId, documentId } = await context.params
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 })
  }

  let response: Response
  try {
    response = await fetch(
      `${serverEnv.apiBaseUrl}/vehicles/provider-registration/${vehicleId}/documents/${documentId}/download`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    )
  } catch {
    return NextResponse.json({ message: "The backend service is unavailable." }, { status: 502 })
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    return NextResponse.json(
      { message: backendMessage(payload) },
      { status: response.status }
    )
  }

  const headers = new Headers()
  const contentType = response.headers.get("content-type")
  const contentDisposition = response.headers.get("content-disposition")
  const contentLength = response.headers.get("content-length")
  if (contentType) headers.set("content-type", contentType)
  if (contentDisposition) headers.set("content-disposition", contentDisposition)
  if (contentLength) headers.set("content-length", contentLength)
  headers.set("cache-control", "private, no-store")

  return new Response(response.body, {
    status: 200,
    headers,
  })
}
