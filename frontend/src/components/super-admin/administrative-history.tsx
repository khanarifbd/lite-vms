import { History } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type AdministrativeHistoryEntry = {
  id: string
  action: string
  actor_name: string | null
  reason: string | null
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function label(value: string) {
  return value
    .replace(/^vts_provider\./, "")
    .replace(/^vehicle_owner\./, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Unknown time" : dateFormatter.format(date)
}

export function AdministrativeHistory({
  entries,
  lastReason,
}: {
  entries: AdministrativeHistoryEntry[]
  lastReason: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-5 text-emerald-700" />
          Account history
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Status changes are immutable audit records. The most recent 50 are shown.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastReason ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
              Latest administrative reason
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-emerald-950">{lastReason}</p>
          </div>
        ) : null}
        {entries.length ? (
          entries.slice(0, 10).map((entry) => {
            const fields = Object.keys(entry.new_values || {}).filter(
              (field) => field !== "reason"
            )
            return (
              <article key={entry.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{label(entry.action)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.actor_name || "System administrator"} · {formatDate(entry.created_at)}
                    </p>
                  </div>
                  {fields.length ? <Badge variant="outline">{fields.length} state fields</Badge> : null}
                </div>
                {entry.reason ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                    {entry.reason}
                  </p>
                ) : null}
              </article>
            )
          })
        ) : (
          <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">
            No account status changes have been recorded yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
