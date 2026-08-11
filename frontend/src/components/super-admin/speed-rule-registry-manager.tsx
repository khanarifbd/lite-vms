"use client"

import { Gauge, History, MapPinned, Pencil, Plus, Power, ShieldCheck, Trash2 } from "lucide-react"
import { FormEvent, useMemo, useState } from "react"

import { EnforcementVehiclePicker } from "@/components/super-admin/enforcement-vehicle-picker"
import { OrganizationTreeSelect } from "@/components/super-admin/organization-tree-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { EnforcementConfiguration, SpeedRule, SpeedRuleVehicleScope } from "@/features/super-admin/enforcement"

type HistoryItem = { id: number; action: string; reason: string | null; created_at: string }
type AreaMode = "national" | "polygon"
type VehicleClassMode = "all" | "specific"

const VEHICLE_CLASSES = [
  { value: "motorcycle", label: "Motorcycle" },
  { value: "private_car", label: "Private car" },
  { value: "microbus", label: "Microbus" },
  { value: "bus", label: "Bus" },
  { value: "truck", label: "Truck" },
  { value: "covered_van", label: "Covered van" },
  { value: "pickup", label: "Pickup" },
  { value: "three_wheeler", label: "CNG / Three-wheeler" },
  { value: "ambulance", label: "Ambulance" },
  { value: "other", label: "Other" },
] as const

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/super-admin/enforcement${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || "Unable to process the enforcement rule.")
  return payload
}

function rulePriority(areaMode: AreaMode, vehicleClassMode: VehicleClassMode, vehicleScope: SpeedRuleVehicleScope) {
  if (vehicleScope === "include_selected") return areaMode === "polygon" ? 600 : 500
  if (areaMode === "polygon" && vehicleClassMode === "specific") return 400
  if (areaMode === "polygon") return 300
  if (vehicleClassMode === "specific") return 200
  return 100
}

function vehicleClassLabel(categories: string[] | null | undefined) {
  if (!categories?.length) return "All vehicle types"
  return categories.map((category) => VEHICLE_CLASSES.find((item) => item.value === category)?.label || category).join(", ")
}

export function SpeedRuleRegistryManager({ initialData }: { initialData: EnforcementConfiguration }) {
  const [rules, setRules] = useState(initialData.speedRules)
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<SpeedRule | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [areaMode, setAreaMode] = useState<AreaMode>("national")
  const [vehicleClassMode, setVehicleClassMode] = useState<VehicleClassMode>("all")
  const [selectedVehicleClasses, setSelectedVehicleClasses] = useState<string[]>([])
  const [vehicleScope, setVehicleScope] = useState<SpeedRuleVehicleScope>("all")
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([])
  const [limit, setLimit] = useState(80)
  const [tolerance, setTolerance] = useState(5)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [history, setHistory] = useState<{ rule: SpeedRule; rows: HistoryItem[] } | null>(null)

  const policies = useMemo(() => initialData.policies.filter((item) => item.violation_type === "overspeed" && item.enabled), [initialData.policies])
  const geofences = useMemo(() => (initialData.geofences ?? []).filter((item) => item.enabled), [initialData.geofences])
  const organizations = initialData.policeOrganizations ?? []
  const organizationTreeItems = useMemo(() => organizations.map((item) => ({
    public_id: String(item.id),
    parent_public_id: null,
    name_en: item.name_en,
    name_bn: item.name_bn,
    organization_type: item.organization_type,
  })), [organizations])

  const visibleRules = useMemo(() => {
    const value = search.trim().toLowerCase()
    if (!value) return rules
    return rules.filter((rule) => {
      const policy = initialData.policies.find((item) => item.id === rule.policy_id)
      const organization = organizations.find((item) => item.id === rule.review_organization_id)
      return `${rule.name} ${policy?.name || ""} ${organization?.name_en || ""} ${organization?.name_bn || ""} ${vehicleClassLabel(rule.vehicle_categories)}`.toLowerCase().includes(value)
    })
  }, [initialData.policies, organizations, rules, search])

  function openCreate() {
    setEditing(null)
    setAreaMode("national")
    setVehicleClassMode("all")
    setSelectedVehicleClasses([])
    setVehicleScope("all")
    setSelectedVehicleIds([])
    setLimit(80)
    setTolerance(5)
    setMessage(null)
    setFormOpen(true)
  }

  function openEdit(rule: SpeedRule) {
    setEditing(rule)
    setAreaMode(rule.area_type === "national" ? "national" : "polygon")
    setVehicleClassMode(rule.vehicle_categories?.length ? "specific" : "all")
    setSelectedVehicleClasses(rule.vehicle_categories ?? [])
    setVehicleScope(rule.vehicle_scope)
    setSelectedVehicleIds(rule.vehicle_ids ?? [])
    setLimit(rule.maximum_speed_kph)
    setTolerance(rule.tolerance_kph)
    setMessage(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (busy) return
    setFormOpen(false)
    setEditing(null)
    setMessage(null)
  }

  function toggleVehicleClass(value: string) {
    setSelectedVehicleClasses((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const geofenceId = String(form.get("geofence_id") || "")
    const reviewOrganizationId = Number(form.get("review_organization_id"))
    if (areaMode === "polygon" && !geofenceId) return setMessage("Select a geofence for the specific-area rule.")
    if (vehicleClassMode === "specific" && !selectedVehicleClasses.length) return setMessage("Select at least one vehicle type.")
    if (vehicleScope !== "all" && !selectedVehicleIds.length) return setMessage("Select at least one vehicle from the vehicle search list.")
    if (!Number.isInteger(reviewOrganizationId) || reviewOrganizationId <= 0) return setMessage("Select the police organization responsible for reviewing violations.")

    const body = {
      name: String(form.get("name") || "").trim(),
      policy_id: form.get("policy_id"),
      geofence_id: areaMode === "polygon" ? geofenceId : null,
      jurisdiction_id: null,
      review_organization_id: reviewOrganizationId,
      area_type: areaMode,
      geometry: null,
      maximum_speed_kph: limit,
      tolerance_kph: tolerance,
      vehicle_scope: vehicleScope,
      vehicle_ids: vehicleScope === "all" ? null : selectedVehicleIds,
      vehicle_categories: vehicleClassMode === "specific" ? selectedVehicleClasses : null,
      active_days: null,
      active_start_time: null,
      active_end_time: null,
      priority: rulePriority(areaMode, vehicleClassMode, vehicleScope),
      enabled: form.get("enabled") === "true",
      effective_from: null,
      effective_to: null,
      ...(editing ? { change_note: String(form.get("change_note") || "").trim() } : {}),
    }

    setBusy(true)
    setMessage(null)
    try {
      const saved = await request(editing ? `/rules/${editing.id}` : "/rules", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) }) as SpeedRule
      setRules((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)))
      setFormOpen(false)
      setEditing(null)
      setMessage(editing ? "Speed rule updated successfully." : "Speed rule created successfully.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the speed rule.")
    } finally { setBusy(false) }
  }

  async function toggle(rule: SpeedRule) {
    const note = window.prompt(`Why are you ${rule.enabled ? "disabling" : "enabling"} ${rule.name}?`)
    if (!note || note.trim().length < 3) return
    setBusy(true)
    try {
      await request(`/rules/${rule.id}/enabled?enabled=${!rule.enabled}&change_note=${encodeURIComponent(note.trim())}`, { method: "PATCH" })
      setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))
      setMessage(`Speed rule ${rule.enabled ? "disabled" : "enabled"} successfully.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to change the rule status.") }
    finally { setBusy(false) }
  }

  async function remove(rule: SpeedRule) {
    const note = window.prompt(`Delete ${rule.name}? Enter a mandatory delete note.`)
    if (!note || note.trim().length < 3) return
    setBusy(true)
    try {
      await request(`/rules/${rule.id}?change_note=${encodeURIComponent(note.trim())}`, { method: "DELETE" })
      setRules((current) => current.filter((item) => item.id !== rule.id))
      setMessage("Speed rule deleted successfully.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to delete the speed rule.") }
    finally { setBusy(false) }
  }

  async function showHistory(rule: SpeedRule) {
    try { setHistory({ rule, rows: await request(`/rules/${rule.id}/history`) as HistoryItem[] }) }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load rule history.") }
  }

  const canCreate = policies.length > 0 && organizations.length > 0

  return <>
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><CardTitle>Enforcement rules</CardTitle><p className="mt-1 text-sm text-muted-foreground">National and geofence-based speed rules are managed from this list.</p></div>
          {rules.length ? <Button disabled={!canCreate} onClick={openCreate} className="bg-emerald-800 hover:bg-emerald-900"><Plus /> Create speed rule</Button> : null}
        </div>
        {rules.length ? <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rule, policy, vehicle type, or police organization" className="mt-4" /> : null}
        {message && !formOpen ? <p className={message.includes("successfully") ? "mt-3 text-sm text-emerald-700" : "mt-3 text-sm text-rose-700"}>{message}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3 p-4 sm:p-6">
        {!rules.length ? <div className="rounded-2xl border border-dashed bg-slate-50 p-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Gauge /></div>
          <h2 className="mt-4 text-lg font-semibold">No speed rules configured</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Create a national or geofence-based rule for vehicle types or explicitly selected vehicles.</p>
          {!policies.length ? <p className="mt-4 text-sm text-amber-700">Create and activate an Overspeed Policy first.</p> : !organizations.length ? <p className="mt-4 text-sm text-amber-700">Create and activate a Police Organization first.</p> : <Button onClick={openCreate} className="mt-5 bg-emerald-800 hover:bg-emerald-900"><Plus /> Create speed rule</Button>}
        </div> : visibleRules.map((rule) => {
          const policy = initialData.policies.find((item) => item.id === rule.policy_id)
          const organization = organizations.find((item) => item.id === rule.review_organization_id)
          const geofence = geofences.find((item) => item.id === rule.geofence_id)
          return <div key={rule.id} className="rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">{rule.area_type === "national" ? <ShieldCheck className="size-5" /> : <MapPinned className="size-5" />}</div><div><p className="font-semibold">{rule.name}</p><p className="mt-1 text-sm text-muted-foreground">{rule.area_type === "national" ? "National rule" : `Specific area · ${geofence?.name || "Unknown geofence"}`} · {policy?.name || "Unknown policy"}</p></div></div><Badge variant="outline" className={rule.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{rule.enabled ? "Active" : "Disabled"}</Badge></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Violation threshold" value={`${rule.maximum_speed_kph + rule.tolerance_kph} km/h`} /><Summary label="Vehicle types" value={vehicleClassLabel(rule.vehicle_categories)} /><Summary label="Police organization" value={organization?.name_bn || organization?.name_en || "Not assigned"} /><Summary label="Vehicle scope" value={rule.vehicle_scope === "all" ? "All matching vehicles" : rule.vehicle_scope === "exclude_selected" ? `All matching except ${rule.vehicle_ids?.length || 0}` : `${rule.vehicle_ids?.length || 0} selected`} /></div>
            <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(rule)}><Pencil /> Edit</Button><Button size="sm" variant="outline" onClick={() => void showHistory(rule)}><History /> History</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle(rule)}><Power /> {rule.enabled ? "Disable" : "Enable"}</Button><Button size="sm" variant="outline" disabled={busy} className="text-rose-700" onClick={() => void remove(rule)}><Trash2 /> Delete</Button></div>
          </div>
        })}
        {rules.length > 0 && !visibleRules.length ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No matching speed rules found.</div> : null}
      </CardContent>
    </Card>

    <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>{editing ? "Edit speed rule" : "Create speed rule"}</DialogTitle><DialogDescription>Select a policy, area, vehicle classes, optional vehicle overrides, and the responsible police organization.</DialogDescription></DialogHeader>
        <form key={editing?.id || "new"} className="space-y-6" onSubmit={submit}>
          <section className="space-y-4"><h3 className="font-semibold">1. Policy and rule identity</h3><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Rule name<Input name="name" required defaultValue={editing?.name} placeholder="National truck speed rule" /></label><label className="grid gap-2 text-sm font-medium">Overspeed policy<select name="policy_id" required defaultValue={editing?.policy_id || ""} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="">Select policy</option>{policies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></section>
          <section className="space-y-4 border-t pt-5"><h3 className="font-semibold">2. Speed and applicable area</h3><div className="grid gap-3 md:grid-cols-2"><Choice active={areaMode === "national"} title="National rule" description="Applies across the country when no specific geofence rule overrides it." onClick={() => setAreaMode("national")} /><Choice active={areaMode === "polygon"} title="Specific area rule" description="Applies only inside a selected reusable geofence." onClick={() => setAreaMode("polygon")} /></div>{areaMode === "polygon" ? <label className="grid gap-2 text-sm font-medium">Geofence<select name="geofence_id" required defaultValue={editing?.geofence_id || ""} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="">Select geofence</option>{geofences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}<div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Official speed limit (km/h)<Input type="number" min="1" max="300" value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></label><label className="grid gap-2 text-sm font-medium">GPS tolerance (km/h)<Input type="number" min="0" max="50" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} /></label></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center"><p className="text-sm text-emerald-800">Violation detection starts above</p><p className="mt-1 text-3xl font-semibold text-emerald-950">{limit + tolerance} km/h</p><p className="mt-1 text-xs text-emerald-700">{limit} km/h limit + {tolerance} km/h tolerance</p></div></section>
          <section className="space-y-4 border-t pt-5"><h3 className="font-semibold">3. Vehicle type and vehicle overrides</h3><div className="grid gap-3 md:grid-cols-2"><Choice active={vehicleClassMode === "all"} title="All vehicle types" description="Use the same speed threshold for every vehicle class." onClick={() => { setVehicleClassMode("all"); setSelectedVehicleClasses([]) }} /><Choice active={vehicleClassMode === "specific"} title="Specific vehicle types" description="Create different limits for bus, truck, motorcycle, private car, or other classes." onClick={() => setVehicleClassMode("specific")} /></div>{vehicleClassMode === "specific" ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{VEHICLE_CLASSES.map((item) => <label key={item.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${selectedVehicleClasses.includes(item.value) ? "border-emerald-500 bg-emerald-50" : "bg-white"}`}><input type="checkbox" checked={selectedVehicleClasses.includes(item.value)} onChange={() => toggleVehicleClass(item.value)} /><span>{item.label}</span></label>)}</div> : null}<div className="grid gap-3 md:grid-cols-3"><Choice active={vehicleScope === "all"} title="All matching vehicles" description="Apply to every vehicle matching the selected classes." onClick={() => { setVehicleScope("all"); setSelectedVehicleIds([]) }} /><Choice active={vehicleScope === "exclude_selected"} title="All except selected" description="Exclude specific vehicles from the class-based rule." onClick={() => setVehicleScope("exclude_selected")} /><Choice active={vehicleScope === "include_selected"} title="Selected vehicles only" description="Apply only to explicitly selected vehicles." onClick={() => setVehicleScope("include_selected")} /></div>{vehicleScope !== "all" ? <EnforcementVehiclePicker selectedIds={selectedVehicleIds} onChange={setSelectedVehicleIds} /> : null}<p className="rounded-xl bg-slate-50 p-3 text-xs text-muted-foreground">Rule precedence: selected vehicles → specific geofence + vehicle type → specific geofence + all types → national + vehicle type → national + all types.</p></section>
          <section className="space-y-4 border-t pt-5"><h3 className="font-semibold">4. Police responsibility and status</h3><label className="grid gap-2 text-sm font-medium">Responsible police organization<OrganizationTreeSelect name="review_organization_id" items={organizationTreeItems} defaultValue={editing?.review_organization_id ? String(editing.review_organization_id) : ""} rootLabel="Select police organization" help="Search and select the police organization whose review team will receive violations created by this rule." /></label><label className="grid gap-2 text-sm font-medium">Status<select name="enabled" defaultValue={String(editing?.enabled ?? true)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="true">Active</option><option value="false">Disabled</option></select></label></section>
          {editing ? <label className="grid gap-2 text-sm font-medium">Change note<Input name="change_note" required minLength={3} placeholder="Explain why this rule is being updated" /></label> : null}
          {message && formOpen ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{message}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">{busy ? "Saving…" : editing ? "Update rule" : "Create rule"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(history)} onOpenChange={(open) => { if (!open) setHistory(null) }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>History — {history?.rule.name}</DialogTitle><DialogDescription>Every update and status change is recorded with its note.</DialogDescription></DialogHeader><div className="max-h-[60vh] space-y-2 overflow-y-auto">{history?.rows.map((row) => <div key={row.id} className="rounded-xl border p-3 text-sm"><p className="font-medium">{row.action.replaceAll("_", " ")}</p><p className="mt-1 text-muted-foreground">{row.reason || "No note"}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p></div>)}{history && !history.rows.length ? <p className="text-sm text-muted-foreground">No history found.</p> : null}</div></DialogContent></Dialog>
  </>
}

function Choice({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${active ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "hover:border-emerald-200"}`}><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></button>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>
}
