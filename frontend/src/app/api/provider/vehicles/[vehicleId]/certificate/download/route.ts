import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME } from "@/lib/auth/cookies"

type RouteContext = { params: Promise<{ vehicleId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ message: "Not authenticated." }, { status: 401 })
  const response = await fetch(
    `${serverEnv.apiBaseUrl}/vehicles/provider-registration/${vehicleId}/certificate/download`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" }, cache: "no-store" }
  )
  if (!response.ok) return NextResponse.json({ message: "Unable to download certificate." }, { status: response.status })
  const inline = new URL(request.url).searchParams.get("view") === "1"
  const disposition = response.headers.get("Content-Disposition") || "attachment; filename=vehicle-certificate.pdf"
  return new NextResponse(response.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": inline ? disposition.replace(/^attachment/i, "inline") : disposition,
    },
  })
}
