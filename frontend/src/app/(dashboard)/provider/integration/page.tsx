import { RadioTower, ShieldAlert } from "lucide-react"
import { redirect } from "next/navigation"

import { ProviderIntegrationManager } from "@/components/provider/provider-integration-manager"
import { ProviderTelemetryApiKeyManager } from "@/components/provider/provider-telemetry-api-key-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import type { ProviderTelemetryApiKeyStatus } from "@/features/provider/telemetry-api-key-types"
import { USER_ROLES, userHasAnyRole, userHasRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import {
  getProviderIntegration,
  getProviderTelemetryApiKeyStatus,
} from "@/lib/provider/workspace-server"

export const dynamic = "force-dynamic"

export default async function ProviderIntegrationPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")

  const canAccessKeyWorkspace = userHasAnyRole(user, [
    USER_ROLES.superAdmin,
    USER_ROLES.vtsAdmin,
    USER_ROLES.vtsTechnical,
  ])

  let provider
  try {
    provider = await getProviderIntegration()
  } catch (error) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Telemetry integration is unavailable</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "Unable to load provider integration details."}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  let apiKeyStatus: ProviderTelemetryApiKeyStatus | null = null
  let apiKeyStatusError: string | null = null
  if (canAccessKeyWorkspace) {
    try {
      apiKeyStatus = await getProviderTelemetryApiKeyStatus(provider.id)
    } catch (error) {
      apiKeyStatusError =
        error instanceof Error ? error.message : "Unable to load telemetry API key status."
    }
  }

  const canManageKey = provider.status === "approved" && canAccessKeyWorkspace

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative max-w-3xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              National GPS gateway
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Telemetry integration</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
              Manage the provider API credential, connect the tracking platform, verify real GPS
              device packets, and monitor live national telemetry readiness.
            </p>
          </div>
        </section>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RadioTower className="size-4" />
          {provider.legal_name} · Source {provider.telemetry_source_code || "pending"}
        </div>

        {apiKeyStatus ? (
          <ProviderTelemetryApiKeyManager
            providerId={provider.id}
            initialStatus={apiKeyStatus}
            canManage={canManageKey}
          />
        ) : apiKeyStatusError ? (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>API key status is unavailable</AlertTitle>
            <AlertDescription>{apiKeyStatusError}</AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <ShieldAlert />
            <AlertTitle>API key management is restricted</AlertTitle>
            <AlertDescription>
              A VTS Admin or VTS Technical user can generate, rotate, and revoke the provider telemetry
              API key. The integration guide remains available below.
            </AlertDescription>
          </Alert>
        )}

        <ProviderIntegrationManager
          initialProvider={provider}
          canManage={userHasRole(user, USER_ROLES.vtsAdmin)}
        />
      </div>
    </div>
  )
}
