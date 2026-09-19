import { notFound } from "next/navigation"

// Telemetry integration is intentionally outside the current Lite VMS scope.
// Do not fetch provider integration state or API credentials for this route.
export default function ProviderIntegrationPage() {
  notFound()
}
