import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME } from "@/lib/auth/cookies"

type RouteContext = { params: Promise<{ vehicleId: string }> }

type VehicleDownloadDetails = {
  registration_number?: string | null
  registration_number_display?: string | null
}

function asciiFilenamePart(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._ -]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    .replace(/^[. -]+|[. -]+$/g, "")

  return normalized || "Vehicle"
}

function encodedFilename(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

function certificateDisposition(vehicle: VehicleDownloadDetails) {
  const vehicleName =
    vehicle.registration_number_display?.trim() ||
    vehicle.registration_number?.trim() ||
    "Vehicle"
  const filename = `${vehicleName}-Certificate.pdf`
  const fallbackFilename = `${asciiFilenamePart(vehicleName)}-Certificate.pdf`

  return `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename(filename)}`
}

export async function GET(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ message: "Not authenticated." }, { status: 401 })

  const authHeaders = { Authorization: `Bearer ${token}` }
  const [response, vehicleResponse] = await Promise.all([
    fetch(
      `${serverEnv.apiBaseUrl}/vehicles/provider-registration/${vehicleId}/certificate/download`,
      {
        headers: { ...authHeaders, Accept: "application/pdf" },
        cache: "no-store",
      }
    ),
    fetch(`${serverEnv.apiBaseUrl}/vehicles/provider-registration/${vehicleId}`, {
      headers: { ...authHeaders, Accept: "application/json" },
      cache: "no-store",
    }),
  ])

  if (!response.ok) {
    return NextResponse.json(
      { message: "Unable to download certificate." },
      { status: response.status }
    )
  }

  const inline = new URL(request.url).searchParams.get("view") === "1"
  let disposition =
    response.headers.get("Content-Disposition") ||
    "attachment; filename=Vehicle-Certificate.pdf"

  if (vehicleResponse.ok) {
    const vehicle = (await vehicleResponse.json()) as VehicleDownloadDetails
    disposition = certificateDisposition(vehicle)
  }

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": inline
        ? disposition.replace(/^attachment/i, "inline")
        : disposition,
    },
  })
}
