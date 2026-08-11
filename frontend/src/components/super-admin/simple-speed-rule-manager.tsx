"use client"

import { CheckCircle2, Gauge, MapPinned, Plus, ShieldCheck, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { FormEvent, useMemo, useState } from "react"

import { SpeedZoneMap, type ZonePoint } from "@/components/super-admin/speed-zone-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { EnforcementConfiguration, SpeedRuleVehicleScope } from "@/features/super-admin/enforcement"
import { cn } from "@/lib/utils"

type AreaMode = "national" | "polygon"

function parseVehicleIds(value: string) {
  return Array.from(new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)))
}

function polygonGeometry(points: ZonePoint[]) {
  const ring = points.map((point) => [point.lng, point.lat])
  if (ring.length) ring.push([...ring[0]])
  return { type: "Polygon", coordinates: [ring] }
}

async function postRule(body: Record<string, unknown>) {
  const response = await fetch("/api/super-admin/enforcement/speed-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || "Unable to create speed rule.")
  return payload
}

export function SimpleSpeedRuleManager({ data }: { data: EnforcementConfiguration }) {
  const router = useRouter()
  const organizations = data.policeOrganizations ?? []
  const policies = useMemo(
    () => data.policies.filter((item) => item.violation_type === "overspeed" && item.enabled),
    [data.policies],
  )
  const [areaMode, setAreaMode] = useState<AreaMode>("national")
  const [zonePoints, setZonePoints] = useState<ZonePoint[]>([])
  const [vehicleScope, setVehicleScope] = useState<SpeedRuleVehicleScope>("all")
  const [limit, setLimit] = useState(80)
  const [tolerance, setTolerance] = useState(5)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const vehicleIds = parseVehicleIds(String(form.get("vehicle_ids") || ""))
    if (areaMode === "polygon" && zonePoints.length < 3) {
      setMessage("Map-এ কমপক্ষে ৩টি point দিয়ে specific area আঁকুন।")
      return
    }
    if (vehicleScope !== "all" && vehicleIds.length === 0) {
      setMessage("Selected vehicle option ব্যবহার করলে অন্তত একটি Vehicle UUID দিতে হবে।")
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      await postRule({
        name: String(form.get("name") || "").trim(),
        policy_id: form.get("policy_id"),
        jurisdiction_id: null,
        review_organization_id: Number(form.get("review_organization_id")),
        area_type: areaMode,
        geometry: areaMode === "polygon" ? polygonGeometry(zonePoints) : null,
        maximum_speed_kph: limit,
        tolerance_kph: tolerance,
        vehicle_scope: vehicleScope,
        vehicle_ids: vehicleScope === "all" ? null : vehicleIds,
        vehicle_categories: null,
        active_days: null,
        active_start_time: null,
        active_end_time: null,
        priority: areaMode === "polygon" ? 50 : 100,
        enabled: true,
        effective_from: null,
        effective_to: null,
      })
      setMessage("Rule তৈরি হয়েছে। Violation হলে selected police organization-এর queue-তে যাবে।")
      event.currentTarget.reset()
      setAreaMode("national")
      setZonePoints([])
      setVehicleScope("all")
      setLimit(80)
      setTolerance(5)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create speed rule.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-emerald-50/70">
          <CardTitle className="flex items-center gap-2 text-2xl"><Plus className="size-5" /> Create speed rule</CardTitle>
          <p className="text-sm text-muted-foreground">একটি existing policy নির্বাচন করুন, কোথায় rule চলবে ঠিক করুন, তারপর দায়িত্বপ্রাপ্ত পুলিশ organization নির্বাচন করুন।</p>
        </CardHeader>
        <CardContent className="p-5 sm:p-7">
          {!policies.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              আগে একটি active Overspeed Policy তৈরি করুন। তারপর এই page থেকে National বা Specific Area rule তৈরি করা যাবে।
              <div className="mt-4"><Button type="button" onClick={() => router.push("/super-admin/enforcement/policies")}>Create overspeed policy</Button></div>
            </div>
          ) : !organizations.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">কোনো active Police Organization পাওয়া যায়নি। আগে Bangladesh Police বা Police Unit organization তৈরি/activate করুন।</div>
          ) : (
            <form className="space-y-7" onSubmit={submit}>
              <section className="space-y-4">
                <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-700" /><h2 className="text-lg font-semibold">1. Select policy</h2></div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">Rule name<Input name="name" required placeholder="Example: National speed rule or Mirpur speed zone" /></label>
                  <label className="grid gap-2 text-sm font-medium">Overspeed policy<select name="policy_id" required className="h-10 rounded-md border bg-white px-3 text-sm"><option value="">Select policy</option>{policies.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.minimum_duration_seconds}s / {item.minimum_consecutive_packets} packets</option>)}</select></label>
                </div>
              </section>

              <section className="space-y-4 border-t pt-6">
                <div className="flex items-center gap-2"><Gauge className="size-5 text-emerald-700" /><h2 className="text-lg font-semibold">2. Speed and area</h2></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <AreaChoice active={areaMode === "national"} title="National overspeed" description="সারা দেশে এই speed limit প্রযোজ্য হবে।" onClick={() => { setAreaMode("national"); setZonePoints([]) }} />
                  <AreaChoice active={areaMode === "polygon"} title="Specific area" description="Map-এ Mirpur, school zone বা নির্দিষ্ট এলাকা আঁকুন।" onClick={() => setAreaMode("polygon")} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">Official speed limit (km/h)<Input type="number" min="1" max="300" value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></label>
                  <label className="grid gap-2 text-sm font-medium">GPS tolerance (km/h)<Input type="number" min="0" max="50" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} /></label>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center"><p className="text-sm text-emerald-800">Violation detection starts above</p><p className="mt-1 text-4xl font-semibold text-emerald-950">{limit + tolerance} km/h</p><p className="mt-1 text-sm text-emerald-700">{limit} limit + {tolerance} tolerance</p></div>
                {areaMode === "polygon" ? <SpeedZoneMap points={zonePoints} onChange={setZonePoints} /> : null}
              </section>

              <section className="space-y-4 border-t pt-6">
                <div className="flex items-center gap-2"><Users className="size-5 text-emerald-700" /><h2 className="text-lg font-semibold">3. Police responsibility and vehicles</h2></div>
                <label className="grid gap-2 text-sm font-medium">Responsible police organization<select name="review_organization_id" required className="h-10 rounded-md border bg-white px-3 text-sm"><option value="">Select police organization</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name_bn || item.name_en} — {item.name_en}</option>)}</select><span className="text-xs font-normal text-muted-foreground">এই rule থেকে violation তৈরি হলে এই organization-এর পুলিশ সদস্যরা তাদের review queue-তে দেখবে।</span></label>
                <div className="grid gap-3 md:grid-cols-3">
                  <AreaChoice active={vehicleScope === "all"} title="All vehicles" description="সব matching গাড়ির জন্য।" onClick={() => setVehicleScope("all")} />
                  <AreaChoice active={vehicleScope === "exclude_selected"} title="Ignore selected" description="List-এর গাড়ি বাদ যাবে।" onClick={() => setVehicleScope("exclude_selected")} />
                  <AreaChoice active={vehicleScope === "include_selected"} title="Selected only" description="শুধু List-এর গাড়িতে চলবে।" onClick={() => setVehicleScope("include_selected")} />
                </div>
                {vehicleScope !== "all" ? <label className="grid gap-2 text-sm font-medium">Vehicle UUID list<textarea name="vehicle_ids" className="min-h-28 rounded-md border bg-white p-3 text-sm" placeholder="One UUID per line or comma separated" /></label> : null}
              </section>

              {message ? <p className={cn("rounded-xl border p-3 text-sm", message.includes("তৈরি হয়েছে") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700")}>{message}</p> : null}
              <div className="flex justify-end"><Button disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">{busy ? "Creating…" : "Create and activate rule"}</Button></div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Configured rules</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.speedRules.length ? data.speedRules.map((rule) => {
            const policy = data.policies.find((item) => item.id === rule.policy_id)
            const organization = organizations.find((item) => item.id === rule.review_organization_id)
            return <div key={rule.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{rule.name}</p><p className="mt-1 text-sm text-muted-foreground">{rule.area_type === "national" ? "National" : "Specific map area"} · {policy?.name || "Unknown policy"}</p></div><Badge variant="outline" className={rule.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{rule.enabled ? "Active" : "Disabled"}</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Summary label="Threshold" value={`${rule.maximum_speed_kph + rule.tolerance_kph} km/h`} /><Summary label="Police organization" value={organization?.name_bn || organization?.name_en || "Not assigned"} /><Summary label="Vehicles" value={rule.vehicle_scope === "all" ? "All vehicles" : rule.vehicle_scope === "exclude_selected" ? `All except ${rule.vehicle_ids?.length || 0}` : `${rule.vehicle_ids?.length || 0} selected only`} /></div></div>
          }) : <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No speed rules created yet.</div>}
        </CardContent>
      </Card>
    </div>
  )
}

function AreaChoice({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("rounded-2xl border p-4 text-left transition", active ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "hover:border-emerald-200")}><div className="flex items-start gap-3">{active ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" /> : <MapPinned className="mt-0.5 size-5 text-slate-400" />}<div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div></button>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
}
