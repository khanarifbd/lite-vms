import { Settings2, ShieldCheck } from "lucide-react"
import { redirect } from "next/navigation"

import { LoginIdentifiersManager } from "@/components/auth/login-identifiers-manager"
import { ProviderSettingsManager } from "@/components/provider/provider-settings-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { USER_ROLES, userHasRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyProviderApplication } from "@/lib/provider/server"

export const dynamic = "force-dynamic"

type SettingsPageProps = {
  searchParams: Promise<{ tab?: string }>
}

const allowedTabs = new Set(["account", "organization", "contacts", "security"])

export default async function ProviderSettingsPage({ searchParams }: SettingsPageProps) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")

  const provider = await getMyProviderApplication()
  if (!provider) redirect("/provider/application")

  const query = await searchParams
  const initialTab = allowedTabs.has(query.tab || "")
    ? (query.tab as "account" | "organization" | "contacts" | "security")
    : "account"
  const canManageProvider = userHasRole(user, USER_ROLES.vtsAdmin)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative max-w-3xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              Provider administration
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Settings and account</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
              Manage your user profile, primary and secondary login identifiers, company operations, integration preferences, contacts, and account security.
            </p>
          </div>
        </section>

        {provider.status !== "approved" ? (
          <Alert>
            <ShieldCheck />
            <AlertTitle>Provider approval is still required</AlertTitle>
            <AlertDescription>
              Account preferences and login identifiers remain available, but operational provider settings become editable after approval.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Settings2 className="size-4" />
          {provider.legal_name} · {provider.code}
        </div>

        <ProviderSettingsManager
          user={user}
          provider={provider}
          canManageProvider={canManageProvider && provider.status === "approved"}
          initialTab={initialTab}
        />

        <LoginIdentifiersManager user={user} workspaceLabel="VTS provider" />
      </div>
    </div>
  )
}
