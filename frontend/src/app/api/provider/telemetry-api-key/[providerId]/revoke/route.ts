import { NextResponse } from "next/server"

// Telemetry integration is not part of the current Lite VMS deployment.
const unavailable = () => NextResponse.json(
  { message: "Telemetry integration is disabled." },
  { status: 404, headers: { "Cache-Control": "no-store" } }
)

export async function POST() {
  return unavailable()
}
