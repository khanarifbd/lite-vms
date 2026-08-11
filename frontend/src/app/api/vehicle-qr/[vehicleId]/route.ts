import { NextResponse } from "next/server"

import { serverEnv } from "@/config/server-env"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export type VehicleQrCard = {
  vehicle_id: string
  registration_number: string
  vehicle_type: string
  token: string
  verification_path: string
  qr_svg: string
  issued_at: string
}

type RouteContext = {
  params: Promise<{ vehicleId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  try {
    const result = await authenticatedBackendFetch<VehicleQrCard>(
      `/qr/vehicles/${encodeURIComponent(vehicleId)}`,
      {
        headers: { "X-Public-Web-Origin": serverEnv.publicWebOrigin },
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to load the vehicle QR code." }, { status: 500 })
  }
}
