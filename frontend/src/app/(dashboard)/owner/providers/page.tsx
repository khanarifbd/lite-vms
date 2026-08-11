import { ShieldAlert } from "lucide-react"

import { ProviderConnectionWorkspace } from "@/components/owner/provider-connection-workspace"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import type { OwnerProviderConnectionWorkspace } from "@/features/owner/types"
import { getOwnerProviderConnectionWorkspace } from "@/lib/owner/server"

export const dynamic = "force-dynamic"

export default async function OwnerProvidersPage() {
  let workspace: OwnerProviderConnectionWorkspace | null = null
  let loadError: string | null = null

  try {
    workspace = await getOwnerProviderConnectionWorkspace()
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "The provider connection service is unavailable."
  }

  if (!workspace) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load provider connections</AlertTitle>
            <AlertDescription>{loadError || "Provider connections are unavailable."}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative max-w-3xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              Consent and vehicle access control
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              VTS provider connections
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
              Find approved providers, review consent requests, control which vehicles each provider can manage, and preserve the complete connection history.
            </p>
          </div>
        </section>

        <ProviderConnectionWorkspace workspace={workspace} />
      </div>
    </div>
  )
}
