"use client"

import { Check, ChevronLeft, ChevronRight, Gauge, MapPinned, ShieldCheck, Target, Users } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { SpeedZoneMap, type ZonePoint } from "@/components/super-admin/speed-zone-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { EnforcementConfiguration } from "@/features/super-admin/enforcement"
import { cn } from "@/lib/utils"

type VehicleScope = "all" | "exclude_selected" | "include_selected"
type AreaMode = "national" | "polygon"

type RuleState = {
  policyId: string
  ruleName: string
  maximumSpeed: number
  tolerance: number
  jurisdictionId: string
  areaMode: AreaMode
  zoneName: string
  zonePoints: ZonePoint[]
  vehicleScope: VehicleScope
  vehicleIdsText: string
  priority: number
}

const steps = [
  { title: "Select policy", icon: ShieldCheck },
  { title: "Speed threshold", icon: Gauge },
  { title: "Applicable area", icon: MapPinned },
  { title: "Vehicle scope", icon: Users },
  { title: "Review & activate", icon: Target },
]

function initialState(defaultAreaMode: AreaMode): RuleState {
  return {
    policyId: "",
    ruleName: defaultAreaMode === "polygon" ? "Mirpur speed rule" : "National default speed rule",
    maximumSpeed: defaultAreaMode === "polygon" ? 40 : 80,
    tolerance: 5,
    jurisdictionId: "",
    areaMode: defaultAreaMode,
    zoneName: defaultAreaMode === "polygon" ? "Mirpur Speed Zone" : "",
    zonePoints: [],
    vehicleScope: "all",
    vehicleIdsText: "",
    priority: defaultAreaMode === "polygon" ? 50 : 100,
  }
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(`/api/super-admin/enforcement/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || "Unable to create speed rule.")
  return payload
}

function parseVehicleIds(value: string) {
  return Array.from(new Set(value.split(/[\n,\s]+/).map((item) => item.trim()).filter(Boolean)))
}

function polygonGeometry(points: ZonePoint[]) {
  if (points.length < 3) return null
  const ring = points.map((point) => [point.lng, point.lat])
  ring.push([points[0].lng, points[0].lat])
  return { type: "Polygon", coordinates: [ring] }
}

export function EnforcementSetupWizard({ initialData, defaultAreaMode = "national" }: { initialData: EnforcementConfiguration; defaultAreaMode?: AreaMode }) {
  const router = useRouter()
  const overspeedPolicies = initialData.policies.filter((item) => item.violation_type === "overspeed" && item.enabled)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<RuleState>(() => initialState(defaultAreaMode))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const threshold = form.maximumSpeed + form.tolerance
  const vehicleIds = useMemo(() => parseVehicleIds(form.vehicleIdsText), [form.vehicleIdsText])
  const selectedPolicy = overspeedPolicies.find((item) => item.id === form.policyId)

  function patch(values: Partial<RuleState>) {
    setForm((current) => ({ ...current, ...values }))
    setMessage(null)
  }

  function validateCurrentStep() {
    if (step === 0 && !form.policyId) return "Select an existing overspeed policy."
    if (step === 1 && (form.ruleName.trim().length < 3 || form.maximumSpeed <= 0 || form.tolerance < 0)) return "Enter a valid rule name, speed limit, and tolerance."
    if (step === 2 && form.areaMode === "polygon" && form.zonePoints.length < 3) return "Draw at least three points around the speed zone."
    if (step === 3 && form.vehicleScope !== "all" && vehicleIds.length === 0) return "Add at least one vehicle UUID for the selected vehicle scope."
    return null
  }

  function next() {
    const error = validateCurrentStep()
    if (error) return setMessage(error)
    setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  async function createRule() {
    const error = validateCurrentStep()
    if (error) return setMessage(error)
    setBusy(true)
    setMessage(null)
    try {
      await request("speed-rules", {
        method: "POST",
        body: JSON.stringify({
          name: form.ruleName.trim(),
          policy_id: form.policyId,
          jurisdiction_id: form.jurisdictionId || null,
          area_type: form.areaMode,
          geometry: form.areaMode === "polygon" ? polygonGeometry(form.zonePoints) : null,
          maximum_speed_kph: form.maximumSpeed,
          tolerance_kph: form.tolerance,
          vehicle_scope: form.vehicleScope,
          vehicle_ids: form.vehicleScope === "all" ? null : vehicleIds,
          vehicle_categories: null,
          active_days: null,
          active_start_time: null,
          active_end_time: null,
          priority: form.areaMode === "polygon" ? Math.min(form.priority, 50) : form.priority,
          enabled: true,
          effective_from: null,
          effective_to: null,
        }),
      })
      setMessage("Speed rule created successfully using the selected reusable policy.")
      setForm(initialState(defaultAreaMode))
      setStep(0)
      router.refresh()
    } catch (errorValue) {
      setMessage(errorValue instanceof Error ? errorValue.message : "Unable to create speed rule.")
    } finally {
      setBusy(false)
    }
  }

  const areaSummary = form.areaMode === "polygon"
    ? `${form.zoneName.trim() || "Custom map zone"} · ${form.zonePoints.length} boundary points`
    : form.jurisdictionId
      ? initialData.jurisdictions.find((item) => item.id === form.jurisdictionId)?.name || "Selected jurisdiction"
      : "National"

  return <Card className="overflow-hidden border-emerald-200 shadow-sm">
    <CardHeader className="border-b bg-emerald-50/70">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><Badge className="bg-emerald-800">Create speed rule</Badge><CardTitle className="mt-3 text-2xl">Apply an existing policy</CardTitle><p className="mt-1 text-sm text-muted-foreground">Policies are reusable. Select one policy, then configure speed, area, and vehicles.</p></div><span className="text-sm font-medium text-emerald-800">Step {step + 1} of {steps.length}</span></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">{steps.map((item, index) => { const Icon = item.icon; return <button key={item.title} type="button" onClick={() => index <= step && setStep(index)} className={cn("rounded-xl border p-3 text-left", index === step ? "border-emerald-500 bg-white" : index < step ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white/60")}><div className="flex items-center gap-2"><span className={cn("flex size-7 items-center justify-center rounded-full", index <= step ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-400")}>{index < step ? <Check className="size-4" /> : <Icon className="size-4" />}</span><span className="text-xs font-semibold">{item.title}</span></div></button> })}</div>
    </CardHeader>
    <CardContent className="p-5 sm:p-7">
      {step === 0 ? <div className="space-y-5">
        {overspeedPolicies.length ? <><div><label className="text-sm font-medium">Existing overspeed policy</label><select className="mt-2 h-11 w-full rounded-md border bg-white px-3 text-sm" value={form.policyId} onChange={(event) => patch({ policyId: event.target.value })}><option value="">Select a policy</option>{overspeedPolicies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>{selectedPolicy ? <div className="grid gap-3 rounded-2xl border bg-slate-50 p-5 sm:grid-cols-4"><Review label="Duration" value={`${selectedPolicy.minimum_duration_seconds}s`} /><Review label="Packets" value={String(selectedPolicy.minimum_consecutive_packets)} /><Review label="Cooldown" value={`${selectedPolicy.cooldown_seconds}s`} /><Review label="Severity" value={selectedPolicy.severity} /></div> : null}</> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="font-medium text-amber-950">Create an overspeed policy first</p><p className="mt-2 text-sm text-amber-800">A policy defines duration, packet count, cooldown, and review severity. It can then be reused by many national or zone rules.</p><Button asChild className="mt-4 bg-emerald-800 hover:bg-emerald-900"><Link href="/super-admin/enforcement/policies">Create violation policy</Link></Button></div>}
      </div> : null}

      {step === 1 ? <div className="grid gap-6 lg:grid-cols-[1fr_1fr_0.8fr]"><div><label className="text-sm font-medium">Speed rule name</label><Input className="mt-2" value={form.ruleName} onChange={(event) => patch({ ruleName: event.target.value })} /></div><NumberField label="Official speed limit" suffix="km/h" value={form.maximumSpeed} onChange={(value) => patch({ maximumSpeed: value })} help="Legal speed limit before tolerance." /><NumberField label="GPS tolerance" suffix="km/h" value={form.tolerance} onChange={(value) => patch({ tolerance: value })} help="Allowance for GPS fluctuation." /><div className="lg:col-span-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center"><p className="text-sm text-emerald-800">Violation detection starts above</p><p className="mt-2 text-4xl font-semibold text-emerald-950">{threshold} km/h</p></div></div> : null}

      {step === 2 ? <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Choice selected={form.areaMode === "national"} title="National / jurisdiction-wide" description="Apply nationally or within a police jurisdiction." onClick={() => patch({ areaMode: "national", zonePoints: [], zoneName: "" })} /><Choice selected={form.areaMode === "polygon"} title="Specific map zone" description="Draw Mirpur, school zone, or another local area." onClick={() => patch({ areaMode: "polygon" })} /></div>{form.areaMode === "national" ? <div><label className="text-sm font-medium">Police jurisdiction (optional)</label><select className="mt-2 h-10 w-full rounded-md border bg-white px-3 text-sm" value={form.jurisdictionId} onChange={(event) => patch({ jurisdictionId: event.target.value })}><option value="">National — no jurisdiction override</option>{initialData.jurisdictions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div> : <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div><label className="text-sm font-medium">Zone name</label><Input className="mt-2" value={form.zoneName} onChange={(event) => patch({ zoneName: event.target.value, ruleName: event.target.value ? `${event.target.value} speed rule` : form.ruleName })} /></div><div><label className="text-sm font-medium">Responsible jurisdiction (optional)</label><select className="mt-2 h-10 w-full rounded-md border bg-white px-3 text-sm" value={form.jurisdictionId} onChange={(event) => patch({ jurisdictionId: event.target.value })}><option value="">No jurisdiction assigned</option>{initialData.jurisdictions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div><SpeedZoneMap points={form.zonePoints} onChange={(zonePoints) => patch({ zonePoints })} /></div>}</div> : null}

      {step === 3 ? <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><Choice selected={form.vehicleScope === "all"} title="All vehicles" description="Apply to every matching vehicle." onClick={() => patch({ vehicleScope: "all", vehicleIdsText: "" })} /><Choice selected={form.vehicleScope === "exclude_selected"} title="Ignore selected vehicles" description="All vehicles except the ignore list." onClick={() => patch({ vehicleScope: "exclude_selected" })} /><Choice selected={form.vehicleScope === "include_selected"} title="Selected vehicles only" description="Only listed vehicles use this rule." onClick={() => patch({ vehicleScope: "include_selected" })} /></div>{form.vehicleScope !== "all" ? <textarea className="min-h-32 w-full rounded-md border bg-white p-3 text-sm" value={form.vehicleIdsText} onChange={(event) => patch({ vehicleIdsText: event.target.value })} placeholder="Vehicle UUIDs, one per line" /> : null}</div> : null}

      {step === 4 ? <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Review label="Policy" value={selectedPolicy?.name || "Not selected"} /><Review label="Speed" value={`${form.maximumSpeed} + ${form.tolerance} = ${threshold} km/h`} /><Review label="Area" value={areaSummary} /><Review label="Vehicles" value={form.vehicleScope === "all" ? "All vehicles" : form.vehicleScope === "exclude_selected" ? `All except ${vehicleIds.length}` : `${vehicleIds.length} selected only`} /></div><div className="rounded-2xl border bg-slate-50 p-5 text-sm text-muted-foreground">This creates only a speed rule. The selected policy remains reusable and unchanged.</div></div> : null}

      {message ? <p className={cn("mt-5 rounded-xl border p-3 text-sm", message.toLowerCase().includes("success") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700")}>{message}</p> : null}
      <div className="mt-7 flex items-center justify-between border-t pt-5"><Button type="button" variant="outline" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}><ChevronLeft /> Back</Button>{step < steps.length - 1 ? <Button type="button" disabled={busy || (step === 0 && !overspeedPolicies.length)} onClick={next} className="bg-emerald-800 hover:bg-emerald-900">Continue <ChevronRight /></Button> : <Button type="button" disabled={busy} onClick={() => void createRule()} className="bg-emerald-800 hover:bg-emerald-900">{busy ? "Creating…" : "Create and activate rule"}</Button>}</div>
    </CardContent>
  </Card>
}

function NumberField({ label, suffix, value, onChange, help }: { label: string; suffix: string; value: number; onChange: (value: number) => void; help: string }) { return <div><label className="text-sm font-medium">{label}</label><div className="mt-2 flex"><Input type="number" min="0" value={value} onChange={(event) => onChange(Number(event.target.value))} className="rounded-r-none" /><span className="flex items-center rounded-r-md border border-l-0 bg-slate-50 px-3 text-xs text-muted-foreground">{suffix}</span></div><p className="mt-2 text-xs text-muted-foreground">{help}</p></div> }
function Choice({ selected, title, description, onClick }: { selected: boolean; title: string; description: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={cn("rounded-2xl border p-5 text-left", selected ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "hover:border-emerald-200")}><div className="flex items-start gap-3"><span className={cn("mt-0.5 flex size-5 items-center justify-center rounded-full border", selected ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300")}>{selected ? <Check className="size-3" /> : null}</span><div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div></button> }
function Review({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div> }
