import { FileClock, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getAuditLogs } from "@/features/super-admin/settings"

export const dynamic = "force-dynamic"

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

export default async function SuperAdminAuditLogsPage() {
  const audit = await getAuditLogs()

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative max-w-3xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              <FileClock className="mr-1 size-3.5" /> National audit trail
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Audit logs</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
              Review system, approval, account, provider, owner, vehicle, and security actions from one dedicated workspace.
            </p>
          </div>
        </section>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Recent activity</CardTitle>
            <div className="relative mt-4 max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search is available through the audit API filters" className="pl-9" disabled />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">
            {audit.items.length ? audit.items.map((item) => {
              const date = new Date(item.created_at)
              return (
                <article key={item.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{label(item.action)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {label(item.resource_type)} · {item.actor_name || "System"}
                      </p>
                    </div>
                    <Badge variant="outline">{date.toLocaleString("en-BD")}</Badge>
                  </div>
                  {item.reason ? <p className="mt-3 text-sm text-amber-800">{item.reason}</p> : null}
                  {item.resource_public_id ? <p className="mt-2 break-all text-xs text-muted-foreground">Reference: {item.resource_public_id}</p> : null}
                </article>
              )
            }) : <p className="text-sm text-muted-foreground">No audit events found.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
