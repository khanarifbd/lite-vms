import { ShieldAlert, Settings2 } from "lucide-react"
import Link from "next/link"

import { SystemSettingsManager } from "@/components/super-admin/system-settings-manager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getSystemSettings } from "@/features/super-admin/settings"

export const dynamic = "force-dynamic"

export default async function SuperAdminSettingsPage() {
  const settings = await getSystemSettings()

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative max-w-3xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              <Settings2 className="mr-1 size-3.5" /> Platform governance
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Settings, automation, and security
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
              Control approval behavior, notifications, document requirements, vehicle categories, and account security. Audit history is available in its dedicated workspace.
            </p>
          </div>
        </section>

        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-800 text-white"><ShieldAlert className="size-5" /></div>
              <div><p className="font-semibold">Traffic enforcement configuration</p><p className="mt-1 text-sm text-muted-foreground">Manage violation policies, speed rules, police jurisdictions, and vehicle exemptions.</p></div>
            </div>
            <Button asChild className="bg-emerald-800 hover:bg-emerald-900"><Link href="/super-admin/enforcement">Open enforcement settings</Link></Button>
          </CardContent>
        </Card>

        <div className="[&>div>div:last-child]:hidden">
          <SystemSettingsManager initialSettings={settings} auditLogs={[]} />
        </div>
      </div>
    </div>
  )
}
