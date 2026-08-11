import { NextResponse } from "next/server"

import { serverEnv } from "@/config/server-env"

type RouteContext = {
  params: Promise<{ token: string }>
}

export async function GET(_: Request, context: RouteContext) {
  const { token } = await context.params

  try {
    const response = await fetch(
      `${serverEnv.apiBaseUrl}/public/qr/verify/${encodeURIComponent(token)}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }
    )
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return NextResponse.json(
        { message: payload?.detail || "Vehicle QR code is invalid or unavailable." },
        { status: response.status }
      )
    }
    return NextResponse.json(payload)
  } catch {
    return NextResponse.json(
      { message: "Vehicle verification service is unavailable." },
      { status: 502 }
    )
  }
}
