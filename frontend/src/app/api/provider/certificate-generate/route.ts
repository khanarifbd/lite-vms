import { NextResponse } from "next/server"

import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type CertificateState = { vts_installation_date: string | null }

type RequestBody = {
  vehicle_id?: string
  certificate_expires_at?: string
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null
  if (!body?.vehicle_id || !body.certificate_expires_at) {
    return NextResponse.json({ message: "Vehicle and certificate expiry date are required." }, { status: 400 })
  }

  try {
    const current = await authenticatedBackendFetch<CertificateState>(
      `/vehicles/provider-registration/${body.vehicle_id}/certificate`
    )
    if (!current.vts_installation_date) {
      return NextResponse.json(
        { message: "Set the VTS installation date in the vehicle record before generating a certificate." },
        { status: 422 }
      )
    }

    const result = await authenticatedBackendFetch(
      `/vehicles/provider-registration/${body.vehicle_id}/certificate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vts_installation_date: current.vts_installation_date,
          certificate_expires_at: body.certificate_expires_at,
        }),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    const status = error instanceof BackendApiError ? error.status : 500
    const message = error instanceof BackendApiError ? error.message : "Unable to generate certificate."
    return NextResponse.json({ message }, { status })
  }
}
