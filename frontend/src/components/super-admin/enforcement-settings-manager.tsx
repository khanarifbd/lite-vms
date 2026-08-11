"use client"

import { Ban, Clock3, Gauge, History, Info, MapPinned, Pencil, Plus, RefreshCw, Scale, ShieldCheck, X } from "lucide-react"
import { FormEvent, ReactNode, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { EnforcementConfiguration, EnforcementPolicy, SpeedRule, SpeedRuleVehicleScope } from "@/features/super-admin/enforcement"
import { cn } from "@/lib/utils"

type Section = "policies" | "speed-rules" | "jurisdictions" | "vehicle-exemptions"
type PolicyHistory = { id: number; actor_user_id: number | null; action: string; previous_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null; reason: string | null; created_at: string }

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
const selectClass = "h-10 rounded-md border bg-white px-3 text-sm"

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/super-admin/enforcement/${path}`, { cache: "no-store", ...init, headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || "Unable to save enforcement configuration.")
  return body
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return <Badge variant="outline" className={enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}>{enabled ? "Active" : "Disabled"}</Badge>
}

function Field({ label: title, help, children }: { label: string; help: string; children: ReactNode }) {
  return <label className="grid gap-1.5"><span className="flex items-center gap-2 text-sm font-medium text-slate-800">{title}<span title={help} className="inline-flex cursor-help text-slate-400"><Info className="size-4" /></span></span>{children}<span className="text-xs leading-5 text-muted-foreground">{help}</span></label>
}

function policyPayload(form: FormData) {
  return {
    name: form.get("name"), violation_type: form.get("violation_type"), scope: "national", severity: form.get("severity"),
    minimum_duration_seconds: Number(form.get("minimum_duration_seconds")), minimum_consecutive_packets: Number(form.get("minimum_consecutive_packets")),
    cooldown_seconds: Number(form.get("cooldown_seconds")), acceptable_packet_delay_seconds: Number(form.get("acceptable_packet_delay_seconds")),
    review_required: true, auto_create_candidate: true, auto_create_case: false, enabled: true, effective_from: null, effective_to: null,
    legal_reference: form.get("legal_reference") || null, notes: form.get("notes") || null,
  }
}

function parseVehicleIds(value: FormDataEntryValue | null) {
  return String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)
}

export function EnforcementSettingsManager({ initialData }: { initialData: EnforcementConfiguration }) {
  const [data, setData] = useState(initialData)
  const [section, setSection] = useState<Section>("policies")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [vehicleScope, setVehicleScope] = useState<SpeedRuleVehicleScope>("all")
  const overspeedPolicies = useMemo(() => data.policies.filter((item) => item.violation_type === "overspeed"), [data.policies])

  async function reload() {
    setBusy(true); setMessage(null)
    try {
      const [policies, jurisdictions, speedRules, exemptions] = await Promise.all([api("policies"), api("jurisdictions"), api("speed-rules"), api("vehicle-exemptions")])
      setData({ policies, jurisdictions, speedRules, exemptions })
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reload data.") }
    finally { setBusy(false) }
  }

  async function toggle(resource: Section, id: string, enabled: boolean) {
    setBusy(true)
    try {
      await api(`${resource}/${id}/enabled?enabled=${String(enabled)}`, { method: "PATCH" })
      setData((current) => ({
        ...current,
        policies: resource === "policies" ? current.policies.map((item) => item.id === id ? { ...item, enabled } : item) : current.policies,
        speedRules: resource === "speed-rules" ? current.speedRules.map((item) => item.id === id ? { ...item, enabled } : item) : current.speedRules,
        jurisdictions: resource === "jurisdictions" ? current.jurisdictions.map((item) => item.id === id ? { ...item, enabled } : item) : current.jurisdictions,
        exemptions: resource === "vehicle-exemptions" ? current.exemptions.map((item) => item.id === id ? { ...item, enabled } : item) : current.exemptions,
      }))
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update status.") }
    finally { setBusy(false) }
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setMessage(null)
    try {
      const created = await api("policies", { method: "POST", body: JSON.stringify(policyPayload(form)) }) as EnforcementPolicy
      setData((current) => ({ ...current, policies: [...current.policies, created].sort((a, b) => a.name.localeCompare(b.name)) }))
      formElement.reset(); setMessage("Violation policy created successfully.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create policy.") }
    finally { setBusy(false) }
  }

  async function createSpeedRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setMessage(null)
    const vehicleIds = parseVehicleIds(form.get("vehicle_ids"))
    try {
      const created = await api("speed-rules", { method: "POST", body: JSON.stringify({
        name: form.get("name"), policy_id: form.get("policy_id"), jurisdiction_id: form.get("jurisdiction_id") || null,
        area_type: "national", geometry: null, maximum_speed_kph: Number(form.get("maximum_speed_kph")), tolerance_kph: Number(form.get("tolerance_kph")),
        vehicle_scope: form.get("vehicle_scope"), vehicle_ids: vehicleScope === "all" ? null : vehicleIds,
        vehicle_categories: null, active_days: null, active_start_time: null, active_end_time: null, priority: Number(form.get("priority")), enabled: true,
        effective_from: null, effective_to: null,
      }) }) as SpeedRule
      setData((current) => ({ ...current, speedRules: [...current.speedRules, created] }))
      formElement.reset(); setVehicleScope("all"); setMessage("Speed rule created successfully.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create speed rule.") }
    finally { setBusy(false) }
  }

  async function createJurisdiction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true)
    try {
      const created = await api("jurisdictions", { method: "POST", body: JSON.stringify({ organization_id: Number(form.get("organization_id")), name: form.get("name"), area_type: "national", geometry: null, priority: Number(form.get("priority")), enabled: true }) })
      setData((current) => ({ ...current, jurisdictions: [...current.jurisdictions, created] })); formElement.reset(); setMessage("Police jurisdiction created successfully.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create jurisdiction.") }
    finally { setBusy(false) }
  }

  async function createExemption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true)
    try {
      const created = await api("vehicle-exemptions", { method: "POST", body: JSON.stringify({ vehicle_id: form.get("vehicle_id"), violation_type: form.get("violation_type") || null, reason: form.get("reason"), reference_number: form.get("reference_number") || null, valid_from: new Date(String(form.get("valid_from"))).toISOString(), valid_to: form.get("valid_to") ? new Date(String(form.get("valid_to"))).toISOString() : null, enabled: true, note: form.get("note") || null }) })
      setData((current) => ({ ...current, exemptions: [created, ...current.exemptions] })); formElement.reset(); setMessage("Vehicle exemption created successfully.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create exemption.") }
    finally { setBusy(false) }
  }

  const tabs = [
    { key: "policies" as const, label: "Policies", count: data.policies.length, icon: Scale },
    { key: "speed-rules" as const, label: "Speed rules", count: data.speedRules.length, icon: Gauge },
    { key: "jurisdictions" as const, label: "Jurisdictions", count: data.jurisdictions.length, icon: MapPinned },
    { key: "vehicle-exemptions" as const, label: "Exemptions", count: data.exemptions.length, icon: Ban },
  ]

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tabs.map(({ key, label: tabLabel, count, icon: Icon }) => <button key={key} type="button" onClick={() => setSection(key)} className={cn("rounded-2xl border bg-white p-4 text-left shadow-sm transition", section === key ? "border-emerald-400 ring-2 ring-emerald-100" : "hover:border-emerald-200")}><div className="flex items-center justify-between"><Icon className="size-5 text-emerald-700" /><span className="text-2xl font-semibold">{count}</span></div><p className="mt-3 text-sm font-medium">{tabLabel}</p></button>)}</div>
    <div className="flex items-center justify-between gap-3"><p className={cn("text-sm", message?.toLowerCase().includes("unable") ? "text-rose-700" : "text-emerald-700")}>{message}</p><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void reload()}><RefreshCw className={busy ? "animate-spin" : ""} /> Refresh</Button></div>

    {section === "policies" ? <div className="grid gap-5 xl:grid-cols-[1fr_1.5fr]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="size-5" />Create violation policy</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={createPolicy}>
        <Field label="Policy name" help="A clear internal name, for example National Overspeed Policy."><Input name="name" required placeholder="National overspeed policy" /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Violation type" help="Select which offence this policy will detect."><select name="violation_type" className={selectClass}><option value="overspeed">Overspeed</option><option value="geofence_violation">Geofence violation</option><option value="route_violation">Route violation</option></select></Field><Field label="Severity" help="Controls review priority. Critical items should appear first in the police queue."><select name="severity" className={selectClass}><option value="medium">Medium</option><option value="low">Low</option><option value="high">High</option><option value="critical">Critical</option></select></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Minimum duration (seconds)" help="The offence condition must remain true for at least this many seconds before creating a candidate."><Input name="minimum_duration_seconds" type="number" defaultValue="10" min="0" required /></Field><Field label="Minimum consecutive packets" help="How many location packets in a row must confirm the offence."><Input name="minimum_consecutive_packets" type="number" defaultValue="3" min="1" required /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Duplicate cooldown (seconds)" help="Wait this long before another candidate for the same ongoing offence."><Input name="cooldown_seconds" type="number" defaultValue="300" min="0" required /></Field><Field label="Maximum packet delay (seconds)" help="Ignore packets arriving later than this limit."><Input name="acceptable_packet_delay_seconds" type="number" defaultValue="120" min="0" required /></Field></div>
        <Field label="Legal reference (optional)" help="Relevant law, section, regulation, circular, or official policy reference."><Input name="legal_reference" placeholder="Example: Road Transport Act, section ..." /></Field>
        <Field label="Internal notes (optional)" help="Implementation or review notes for administrators."><Input name="notes" placeholder="Add implementation or review notes" /></Field>
        <Button disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">Create policy</Button>
      </form></CardContent></Card>
      <PolicyList items={data.policies} busy={busy} onToggle={(id, enabled) => toggle("policies", id, enabled)} onUpdated={(updated) => setData((current) => ({ ...current, policies: current.policies.map((item) => item.id === updated.id ? updated : item) }))} setMessage={setMessage} />
    </div> : null}

    {section === "speed-rules" ? <div className="grid gap-5 xl:grid-cols-[1fr_1.5fr]">
      <Card><CardHeader><CardTitle>Create speed rule</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={createSpeedRule}>
        <Field label="Rule name" help="A recognizable name for this speed limit."><Input name="name" required placeholder="National default speed rule" /></Field>
        <Field label="Overspeed policy" help="Controls duration, packet count, cooldown, and delayed packet handling."><select name="policy_id" required className={selectClass}><option value="">Select overspeed policy</option>{overspeedPolicies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Police jurisdiction (optional)" help="Leave empty for a national rule or select the responsible police authority."><select name="jurisdiction_id" className={selectClass}><option value="">No jurisdiction override</option>{data.jurisdictions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Official speed limit (km/h)" help="The legal maximum speed before tolerance is applied."><Input name="maximum_speed_kph" type="number" defaultValue="80" min="1" required /></Field><Field label="GPS tolerance (km/h)" help="Extra allowance used to reduce false violations caused by GPS fluctuation."><Input name="tolerance_kph" type="number" defaultValue="5" min="0" required /></Field></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">Example: limit 80 + tolerance 5 means the overspeed threshold starts above 85 km/h.</div>
        <Field label="Vehicle applicability" help="Choose whether this rule covers every vehicle, excludes selected vehicles, or applies only to selected vehicles."><select name="vehicle_scope" value={vehicleScope} onChange={(event) => setVehicleScope(event.target.value as SpeedRuleVehicleScope)} className={selectClass}><option value="all">Apply to all vehicles</option><option value="exclude_selected">All vehicles except selected</option><option value="include_selected">Selected vehicles only</option></select></Field>
        {vehicleScope !== "all" ? <Field label={vehicleScope === "exclude_selected" ? "Ignored vehicle IDs" : "Included vehicle IDs"} help="Enter vehicle UUIDs separated by commas, spaces, or new lines. Each vehicle is verified by the backend."><textarea name="vehicle_ids" required rows={4} className="rounded-md border bg-white px-3 py-2 text-sm" placeholder="vehicle-uuid-1&#10;vehicle-uuid-2" /></Field> : null}
        <Field label="Priority" help="Lower numbers are evaluated first when several speed rules match."><Input name="priority" type="number" defaultValue="100" min="0" required /></Field>
        <Button disabled={busy || !overspeedPolicies.length} className="bg-emerald-800 hover:bg-emerald-900">Create speed rule</Button>
        {!overspeedPolicies.length ? <p className="text-xs text-amber-700">Create an overspeed policy first.</p> : null}
      </form></CardContent></Card>
      <SpeedRuleList items={data.speedRules} policies={data.policies} busy={busy} onToggle={(id, enabled) => toggle("speed-rules", id, enabled)} />
    </div> : null}

    {section === "jurisdictions" ? <div className="grid gap-5 xl:grid-cols-[1fr_1.5fr]"><Card><CardHeader><CardTitle>Create national jurisdiction</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={createJurisdiction}><Field label="Police organization ID" help="Internal ID of the police organization that owns this jurisdiction."><Input name="organization_id" type="number" required /></Field><Field label="Jurisdiction name" help="A clear authority name."><Input name="name" required placeholder="Bangladesh Police national jurisdiction" /></Field><Field label="Priority" help="Lower numbers take precedence when jurisdiction areas overlap."><Input name="priority" type="number" defaultValue="100" min="0" required /></Field><Button disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">Create jurisdiction</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Jurisdictions</CardTitle></CardHeader><CardContent className="space-y-3">{data.jurisdictions.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border p-4"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">Organization #{item.organization_id} · {label(item.area_type)} · priority {item.priority}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle("jurisdictions", item.id, !item.enabled)}><StatusBadge enabled={item.enabled} /></Button></div>)}</CardContent></Card></div> : null}

    {section === "vehicle-exemptions" ? <div className="grid gap-5 xl:grid-cols-[1fr_1.5fr]"><Card><CardHeader><CardTitle>Create vehicle exemption</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={createExemption}><Field label="Vehicle ID" help="The UUID of the vehicle receiving the exemption."><Input name="vehicle_id" required /></Field><Field label="Violation coverage" help="Apply to one violation type or all violation types."><select name="violation_type" className={selectClass}><option value="">All violation types</option><option value="overspeed">Overspeed</option><option value="geofence_violation">Geofence violation</option><option value="route_violation">Route violation</option></select></Field><Field label="Exemption reason" help="Official reason automated enforcement should ignore this vehicle."><select name="reason" className={selectClass}><option value="emergency_service">Emergency service</option><option value="law_enforcement">Law enforcement</option><option value="special_permit">Special permit</option><option value="testing">Testing</option><option value="other">Other</option></select></Field><Field label="Reference number" help="Permit, order, approval, or document number."><Input name="reference_number" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Valid from" help="Start date and time."><Input name="valid_from" type="datetime-local" required /></Field><Field label="Valid until" help="Optional end date and time."><Input name="valid_to" type="datetime-local" /></Field></div><Field label="Administrative note" help="Reason details for reviewers."><Input name="note" /></Field><Button disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">Create exemption</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Vehicle exemptions</CardTitle></CardHeader><CardContent className="space-y-3">{data.exemptions.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border p-4"><div className="min-w-0"><p className="truncate font-medium">{item.vehicle_id}</p><p className="text-xs text-muted-foreground">{label(item.reason)} · {item.violation_type ? label(item.violation_type) : "All violations"}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle("vehicle-exemptions", item.id, !item.enabled)}><StatusBadge enabled={item.enabled} /></Button></div>)}</CardContent></Card></div> : null}
  </div>
}

function PolicyList({ items, busy, onToggle, onUpdated, setMessage }: { items: EnforcementPolicy[]; busy: boolean; onToggle: (id: string, enabled: boolean) => void; onUpdated: (item: EnforcementPolicy) => void; setMessage: (value: string | null) => void }) {
  const [editing, setEditing] = useState<EnforcementPolicy | null>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [history, setHistory] = useState<PolicyHistory[]>([])
  const [localBusy, setLocalBusy] = useState(false)

  async function updatePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; const form = new FormData(event.currentTarget); const changeNote = String(form.get("change_note") || "").trim()
    if (changeNote.length < 3) { setMessage("A change note is required before updating a policy."); return }
    setLocalBusy(true)
    try { const updated = await api(`policies/${editing.id}`, { method: "PUT", body: JSON.stringify({ ...policyPayload(form), change_note: changeNote }) }) as EnforcementPolicy; onUpdated(updated); setEditing(null); setMessage("Policy updated and change history recorded.") }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update policy.") }
    finally { setLocalBusy(false) }
  }

  async function loadHistory(id: string) {
    if (historyFor === id) { setHistoryFor(null); return }
    setLocalBusy(true)
    try { setHistory(await api(`policies/${id}/history`) as PolicyHistory[]); setHistoryFor(id) }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load policy history.") }
    finally { setLocalBusy(false) }
  }

  return <Card><CardHeader><CardTitle>Violation policies</CardTitle></CardHeader><CardContent className="space-y-3">{items.length ? items.map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{label(item.violation_type)} · {label(item.severity)} severity</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy || localBusy} onClick={() => setEditing(item)}><Pencil /> Edit</Button><Button size="sm" variant="outline" disabled={busy || localBusy} onClick={() => void loadHistory(item.id)}><History /> History</Button><Button size="sm" variant="outline" disabled={busy || localBusy} onClick={() => onToggle(item.id, !item.enabled)}><StatusBadge enabled={item.enabled} /></Button></div></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-slate-50 p-2"><p className="font-semibold">{item.minimum_duration_seconds}s</p><p className="text-muted-foreground">Duration</p></div><div className="rounded-lg bg-slate-50 p-2"><p className="font-semibold">{item.minimum_consecutive_packets}</p><p className="text-muted-foreground">Packets</p></div><div className="rounded-lg bg-slate-50 p-2"><p className="font-semibold">{item.cooldown_seconds}s</p><p className="text-muted-foreground">Cooldown</p></div></div>{historyFor === item.id ? <div className="mt-4 space-y-2 border-t pt-4"><p className="text-sm font-semibold">Change history</p>{history.map((entry) => <div key={entry.id} className="rounded-lg bg-slate-50 p-3 text-xs"><div className="flex justify-between"><span className="font-medium">{label(entry.action)}</span><span className="flex items-center gap-1 text-muted-foreground"><Clock3 className="size-3" />{new Date(entry.created_at).toLocaleString("en-BD")}</span></div><p className="mt-1">{entry.reason || "No note supplied"}</p></div>)}</div> : null}</div>) : <Empty text="No violation policies configured." />}</CardContent>
    {editing ? <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4"><Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto"><CardHeader><div className="flex items-center justify-between"><CardTitle>Edit violation policy</CardTitle><Button type="button" size="icon" variant="ghost" onClick={() => setEditing(null)}><X /></Button></div></CardHeader><CardContent><form className="grid gap-4" onSubmit={updatePolicy}><Field label="Policy name" help="Update the internal policy name."><Input name="name" required defaultValue={editing.name} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Violation type" help="Select which offence this policy detects."><select name="violation_type" defaultValue={editing.violation_type} className={selectClass}><option value="overspeed">Overspeed</option><option value="geofence_violation">Geofence violation</option><option value="route_violation">Route violation</option></select></Field><Field label="Severity" help="Controls police review priority."><select name="severity" defaultValue={editing.severity} className={selectClass}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Minimum duration" help="Required continuous duration."><Input name="minimum_duration_seconds" type="number" required defaultValue={editing.minimum_duration_seconds} /></Field><Field label="Minimum packets" help="Required consecutive packets."><Input name="minimum_consecutive_packets" type="number" required defaultValue={editing.minimum_consecutive_packets} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Cooldown" help="Duplicate prevention interval."><Input name="cooldown_seconds" type="number" required defaultValue={editing.cooldown_seconds} /></Field><Field label="Packet delay" help="Maximum acceptable packet delay."><Input name="acceptable_packet_delay_seconds" type="number" required defaultValue={editing.acceptable_packet_delay_seconds} /></Field></div><Field label="Legal reference" help="Relevant law or policy."><Input name="legal_reference" defaultValue={editing.legal_reference || ""} /></Field><Field label="Internal notes" help="Administrative notes."><Input name="notes" defaultValue={editing.notes || ""} /></Field><Field label="Change note (required)" help="Explain why this policy is changing."><Input name="change_note" required minLength={3} /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={localBusy} className="bg-emerald-800 hover:bg-emerald-900">Save changes</Button></div></form></CardContent></Card></div> : null}
  </Card>
}

function SpeedRuleList({ items, policies, busy, onToggle }: { items: SpeedRule[]; policies: EnforcementPolicy[]; busy: boolean; onToggle: (id: string, enabled: boolean) => void }) {
  const policyName = (id: string) => policies.find((item) => item.id === id)?.name || "Unknown policy"
  const scopeLabel = (item: SpeedRule) => item.vehicle_scope === "all" ? "All vehicles" : item.vehicle_scope === "exclude_selected" ? `All except ${item.vehicle_ids?.length || 0} selected` : `${item.vehicle_ids?.length || 0} selected vehicles only`
  return <Card><CardHeader><CardTitle>Speed rules</CardTitle></CardHeader><CardContent className="space-y-3">{items.length ? items.map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{policyName(item.policy_id)} · {label(item.area_type)}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => onToggle(item.id, !item.enabled)}><StatusBadge enabled={item.enabled} /></Button></div><div className="mt-3 flex flex-wrap items-center gap-2"><Badge className="bg-emerald-700">Limit {item.maximum_speed_kph} km/h</Badge><Badge variant="outline">Tolerance +{item.tolerance_kph}</Badge><Badge variant="outline">Threshold {item.maximum_speed_kph + item.tolerance_kph} km/h</Badge><Badge variant="outline">{scopeLabel(item)}</Badge><Badge variant="outline">Priority {item.priority}</Badge></div></div>) : <Empty text="No speed rules configured." />}</CardContent></Card>
}

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed p-10 text-center"><ShieldCheck className="mx-auto size-8 text-slate-400" /><p className="mt-3 text-sm text-muted-foreground">{text}</p></div> }
