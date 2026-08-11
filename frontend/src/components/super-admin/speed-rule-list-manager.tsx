"use client"

import { History, Pencil, X } from "lucide-react"
import { FormEvent, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { EnforcementPolicy, SpeedRule } from "@/features/super-admin/enforcement"

type Props = { initialRules: SpeedRule[]; policies: EnforcementPolicy[]; title?: string }

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/super-admin/enforcement/${path}`, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || "Unable to update speed rule.")
  return body
}

export function SpeedRuleListManager({ initialRules, policies, title = "Configured speed rules" }: Props) {
  const [rules, setRules] = useState(initialRules)
  const [editing, setEditing] = useState<SpeedRule | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const policyName = (id: string) => policies.find((item) => item.id === id)?.name || "Overspeed policy"

  async function toggle(rule: SpeedRule) {
    setBusy(true); setMessage(null)
    try {
      await api(`speed-rules/${rule.id}/enabled?enabled=${String(!rule.enabled)}`, { method: "PATCH" })
      setRules((items) => items.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update status.") }
    finally { setBusy(false) }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const form = new FormData(event.currentTarget)
    setBusy(true); setMessage(null)
    try {
      const updated = await api(`speed-rules/${editing.id}`, { method: "PUT", body: JSON.stringify({
        name: form.get("name"), policy_id: editing.policy_id, jurisdiction_id: editing.jurisdiction_id,
        area_type: editing.area_type, geometry: editing.geometry,
        maximum_speed_kph: Number(form.get("maximum_speed_kph")), tolerance_kph: Number(form.get("tolerance_kph")),
        vehicle_scope: editing.vehicle_scope, vehicle_ids: editing.vehicle_ids, vehicle_categories: editing.vehicle_categories,
        active_days: editing.active_days, active_start_time: editing.active_start_time, active_end_time: editing.active_end_time,
        priority: Number(form.get("priority")), enabled: editing.enabled,
        effective_from: editing.effective_from, effective_to: editing.effective_to,
        change_note: form.get("change_note"),
      }) }) as SpeedRule
      setRules((items) => items.map((item) => item.id === updated.id ? updated : item))
      setEditing(null); setMessage("Speed rule updated and change note recorded.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update rule.") }
    finally { setBusy(false) }
  }

  return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{title}</CardTitle><span className="text-sm text-muted-foreground">{rules.length} rule{rules.length === 1 ? "" : "s"}</span></div></CardHeader><CardContent className="space-y-3">
    {message ? <p className="rounded-xl border bg-slate-50 p-3 text-sm">{message}</p> : null}
    {rules.length ? rules.map((rule) => {
      const threshold = rule.maximum_speed_kph + rule.tolerance_kph
      const scope = rule.vehicle_scope === "all" ? "All vehicles" : rule.vehicle_scope === "exclude_selected" ? `All except ${rule.vehicle_ids?.length || 0}` : `${rule.vehicle_ids?.length || 0} selected only`
      return <div key={rule.id} className="rounded-2xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{rule.name}</p><p className="mt-1 text-sm text-muted-foreground">{policyName(rule.policy_id)} · {rule.area_type === "national" ? "National" : "Map zone"}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(rule)}><Pencil /> Edit</Button><Button size="sm" variant="outline" asChild><a href="/super-admin/audit-logs"><History /> History</a></Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle(rule)}><Badge variant="outline" className={rule.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-slate-500"}>{rule.enabled ? "Active" : "Disabled"}</Badge></Button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="Official limit" value={`${rule.maximum_speed_kph} km/h`} /><Metric label="Tolerance" value={`+${rule.tolerance_kph} km/h`} /><Metric label="Violation threshold" value={`${threshold} km/h`} /><Metric label="Vehicle scope" value={scope} /></div></div>
    }) : <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No speed rules configured yet.</div>}
    {editing ? <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4"><Card className="w-full max-w-xl"><CardHeader><div className="flex items-center justify-between"><CardTitle>Edit speed rule</CardTitle><Button size="icon" variant="ghost" onClick={() => setEditing(null)}><X /></Button></div></CardHeader><CardContent><form className="grid gap-4" onSubmit={update}><label className="grid gap-2 text-sm font-medium">Rule name<Input name="name" defaultValue={editing.name} required /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Official speed limit<Input name="maximum_speed_kph" type="number" min="1" defaultValue={editing.maximum_speed_kph} required /></label><label className="grid gap-2 text-sm font-medium">GPS tolerance<Input name="tolerance_kph" type="number" min="0" defaultValue={editing.tolerance_kph} required /></label></div><label className="grid gap-2 text-sm font-medium">Priority<Input name="priority" type="number" min="0" defaultValue={editing.priority} required /></label><label className="grid gap-2 text-sm font-medium">Change note<Input name="change_note" minLength={3} required placeholder="Explain why this rule is changing" /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">Save changes</Button></div></form></CardContent></Card></div> : null}
  </CardContent></Card>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div> }
