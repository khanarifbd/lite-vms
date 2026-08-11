"use client"

import {
  AlertTriangle,
  Building2,
  CarFront,
  Clock3,
  FileWarning,
  Gauge,
  Loader2,
  MapPinned,
  RadioTower,
  RefreshCw,
  Route,
  ShieldAlert,
  Wifi,
  WifiOff,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { LiveFleetMap } from "@/components/super-admin/live-fleet-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { NationalMonitoringDashboard } from "@/features/super-admin/monitoring"

const MONITORING_PATH = "/super-admin/monitoring"
const POLL_INTERVAL_MS = 30_000

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null) {
  if (!value) return "No signal"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "No signal" : dateFormatter.format(date)
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

function StatCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  title: string
  value: number
  detail: string
  icon: typeof CarFront
  tone?: "default" | "success" | "warning" | "danger"
}) {
  const classes = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-700",
  }[tone]
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-3 text-3xl font-semibold">{value.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className={`flex size-11 items-center justify-center rounded-2xl ${classes}`}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

export function NationalMonitoringCenter({ initialData }: { initialData: NationalMonitoringDashboard }) {
  const pathname = usePathname()
  const [data, setData] = useState(initialData)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vehicleFilter, setVehicleFilter] = useState<"all" | "moving" | "idle" | "offline">("all")
  const abortRef = useRef<AbortController | null>(null)
  const requestInFlightRef = useRef(false)

  const refresh = useCallback(async (manual = false) => {
    if (pathname !== MONITORING_PATH || document.visibilityState !== "visible") return
    if (requestInFlightRef.current) return

    requestInFlightRef.current = true
    if (manual) setRefreshing(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch("/api/super-admin/monitoring", {
        cache: "no-store",
        signal: controller.signal,
      })
      const body = (await response.json()) as NationalMonitoringDashboard & { message?: string }
      if (!response.ok) throw new Error(body.message || "Unable to refresh monitoring data.")
      setData(body)
      setError(null)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      setError(cause instanceof Error ? cause.message : "Unable to refresh monitoring data.")
    } finally {
      requestInFlightRef.current = false
      if (manual) setRefreshing(false)
    }
  }, [pathname])

  useEffect(() => {
    if (pathname !== MONITORING_PATH) return

    let timeoutId: number | undefined
    let stopped = false

    const scheduleNext = () => {
      if (stopped) return
      timeoutId = window.setTimeout(async () => {
        if (document.visibilityState === "visible" && pathname === MONITORING_PATH) {
          await refresh()
        }
        scheduleNext()
      }, POLL_INTERVAL_MS)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && pathname === MONITORING_PATH) {
        void refresh()
      } else {
        abortRef.current?.abort()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    scheduleNext()

    return () => {
      stopped = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      abortRef.current?.abort()
      abortRef.current = null
      requestInFlightRef.current = false
    }
  }, [pathname, refresh])

  const filteredVehicles = useMemo(
    () =>
      vehicleFilter === "all"
        ? data.vehicles
        : data.vehicles.filter((vehicle) => vehicle.movement_state === vehicleFilter),
    [data.vehicles, vehicleFilter],
  )

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
        <div className="absolute -right-20 -top-28 size-80 rounded-full border border-white/10" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              <RadioTower className="mr-1 size-3.5" /> National monitoring
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Live fleet and enforcement command center
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
              Monitor fleet movement, provider health, offline GPS devices, expired documents, and violation alerts across Bangladesh.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <Button type="button" variant="secondary" onClick={() => void refresh(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh now
            </Button>
            <p className="text-xs text-emerald-100/60">Updated {formatDate(data.generated_at)} · refreshes only while this page is visible</p>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Tracked vehicles" value={data.stats.tracked_vehicles} detail={`${data.stats.moving_vehicles} moving · ${data.stats.idle_vehicles} idle`} icon={CarFront} />
        <StatCard title="GPS online" value={data.stats.online_vehicles} detail="Signal received in the last five minutes" icon={Wifi} tone="success" />
        <StatCard title="GPS offline" value={data.stats.offline_vehicles} detail="Active assignments without a recent signal" icon={WifiOff} tone={data.stats.offline_vehicles ? "danger" : "success"} />
        <StatCard title="Provider attention" value={data.stats.unhealthy_providers} detail={`${data.stats.active_providers} approved providers monitored`} icon={Building2} tone={data.stats.unhealthy_providers ? "warning" : "success"} />
        <StatCard title="Pending violations" value={data.stats.pending_violations} detail="Awaiting police review" icon={ShieldAlert} tone={data.stats.pending_violations ? "warning" : "success"} />
        <StatCard title="Overspeed" value={data.stats.overspeed_alerts} detail="Pending overspeed candidates" icon={Gauge} tone={data.stats.overspeed_alerts ? "danger" : "success"} />
        <StatCard title="Geofence / route" value={data.stats.geofence_alerts + data.stats.route_alerts} detail={`${data.stats.geofence_alerts} geofence · ${data.stats.route_alerts} route`} icon={Route} tone="warning" />
        <StatCard title="Expired documents" value={data.stats.expired_documents} detail="Active vehicle documents requiring action" icon={FileWarning} tone={data.stats.expired_documents ? "danger" : "success"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div><CardTitle>Bangladesh fleet map</CardTitle><p className="mt-1 text-sm text-muted-foreground">Interactive OpenStreetMap using the latest valid coordinates from active tracking assignments.</p></div>
              <div className="flex flex-wrap gap-2">
                {(["all", "moving", "idle", "offline"] as const).map((item) => <Button key={item} type="button" size="sm" variant={vehicleFilter === item ? "default" : "outline"} onClick={() => setVehicleFilter(item)}>{label(item)}</Button>)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0"><LiveFleetMap vehicles={filteredVehicles} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Provider health</CardTitle><p className="text-sm text-muted-foreground">Telemetry-source and fleet connectivity overview.</p></CardHeader>
          <CardContent className="space-y-3">
            {data.provider_health.length ? data.provider_health.map((provider) => <Link key={provider.provider_id} href={`/super-admin/providers/${provider.provider_id}`} className="block rounded-2xl border p-4 transition hover:border-emerald-300"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{provider.provider_name}</p><p className="mt-1 text-xs text-muted-foreground">{provider.provider_code} · {label(provider.source_status || "not provisioned")}</p></div><Badge variant="outline" className={provider.health === "healthy" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{label(provider.health)}</Badge></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2"><p className="text-xs text-muted-foreground">Tracked</p><p className="font-semibold">{provider.tracked_vehicles}</p></div><div className="rounded-xl bg-emerald-50 p-2"><p className="text-xs text-emerald-700">Online</p><p className="font-semibold text-emerald-900">{provider.online_vehicles}</p></div><div className="rounded-xl bg-rose-50 p-2"><p className="text-xs text-rose-700">Offline</p><p className="font-semibold text-rose-900">{provider.offline_vehicles}</p></div></div><p className="mt-3 text-xs text-muted-foreground">Last signal: {formatDate(provider.last_seen_at)}</p></Link>) : <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No approved provider telemetry sources.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Priority violation alerts</CardTitle><p className="text-sm text-muted-foreground">Latest overspeed, geofence, route, and expired-document candidates.</p></CardHeader>
          <CardContent className="space-y-3">
            {data.alerts.length ? data.alerts.slice(0, 20).map((alert) => <article key={alert.id} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700"><AlertTriangle className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/super-admin/vehicles/${alert.vehicle_id}`} className="font-medium hover:text-emerald-800">{alert.registration_number}</Link><Badge variant="outline">{label(alert.violation_type)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Detected {formatDate(alert.detected_at)}</p>{alert.detected_value != null ? <p className="mt-2 text-sm">Detected {alert.detected_value}{alert.allowed_value != null ? ` · Allowed ${alert.allowed_value}` : ""}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{alert.latitude.toFixed(5)}, {alert.longitude.toFixed(5)}</p></div></div></article>) : <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No pending violation alerts.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Fleet signal list</CardTitle><p className="text-sm text-muted-foreground">Latest high-priority moving and offline vehicles.</p></CardHeader>
          <CardContent className="space-y-3">
            {data.vehicles.slice(0, 30).map((vehicle) => <Link key={vehicle.id} href={`/super-admin/vehicles/${vehicle.id}`} className="flex items-start gap-3 rounded-2xl border p-4 transition hover:border-emerald-300"><div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${vehicle.online ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}>{vehicle.online ? <MapPinned className="size-4" /> : <WifiOff className="size-4" />}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate font-medium">{vehicle.registration_number_display || vehicle.registration_number}</p><Badge variant="outline">{label(vehicle.movement_state)}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{vehicle.owner_name} · {vehicle.provider_name || "Owner managed"}</p><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" />{formatDate(vehicle.recorded_at)} · {(vehicle.speed_kph || 0).toFixed(0)} km/h</p></div></Link>)}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
