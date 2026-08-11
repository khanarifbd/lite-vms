import { Settings2, ShieldCheck } from "lucide-react"
import { redirect } from "next/navigation"

import { LoginIdentifiersManager } from "@/components/auth/login-identifiers-manager"
import { OwnerSettingsManager } from "@/components/owner/owner-settings-manager"
import { Badge } from "@/components/ui/badge"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyOwnerApplication } from "@/lib/owner/server"

export const dynamic = "force-dynamic"

type SettingsPageProps = {
  searchParams: Promise<{ tab?: string }>
}

const allowedTabs = new Set(["account", "profile", "security"])

export default async function OwnerSettingsPage({ searchParams }: SettingsPageProps) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  const owner = await getMyOwnerApplication()
  if (!owner) redirect("/owner/profile")

  const query = await searchParams
  const initialTab = allowedTabs.has(query.tab || "")
    ? (query.tab as "account" | "profile" | "security")
    : "account"

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative max-w-3xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              Owner administration
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Settings and account</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
              Manage portal preferences, primary and secondary login identifiers, your verified owner profile, and account security.
            </p>
          </div>
        </section>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Settings2 className="size-4" />
          {owner.owner_name} · {owner.owner_code || "Owner code pending"}
          <ShieldCheck className="ml-2 size-4 text-emerald-700" />
          <span className="capitalize">{owner.verification_status.replaceAll("_", " ")}</span>
        </div>

        <OwnerSettingsManager user={user} owner={owner} initialTab={initialTab} />

        <LoginIdentifiersManager user={user} workspaceLabel="vehicle owner" />
      </div>
    </div>
  )
}
