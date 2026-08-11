"use client"

import "leaflet/dist/leaflet.css"

import { History, Loader2, MapPinned, Navigation, Route, Timer, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type TripPoint = {
  id: string
  recorded_at: string
  latitude: number
  longitude: number
  speed_kph: number
  heading: number | null
  ignition: boolean | null
  is_incident_point: boolean
}

type TripHistory = {
  candidate_id: string
  vehicle_id: string
  registration_number: string
  detected_at: string
  window_start: string
  window_end: string
  detected_speed_kph: number | null
  allowed_speed_kph: number | null
  points: TripPoint[]
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function IncidentTripHistoryDialog({
  candidateId,
  vehicleLabel,
}: {
  candidateId: string
  vehicleLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TripHistory | null>(null)
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<{ remove: () => void } | null>(null)

  async function loadHistory() {
    setOpen(true)
    if (data || loading) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/super-admin/enforcement/review-queue/${encodeURIComponent(candidateId)}/trip-history`,
        { cache: "no-store" }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || "Unable to load trip history.")
      setData(payload as TripHistory)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load trip history.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !data || !mapElementRef.current || !data.points.length) return
    let cancelled = false

    void import("leaflet").then((leafletModule) => {
      if (cancelled || !mapElementRef.current) return
      const L = leafletModule.default
      mapRef.current?.remove()

      const map = L.map(mapElementRef.current, {
        zoomControl: true,
        attributionControl: true,
      })
      mapRef.current = map

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map)

      const coordinates = data.points.map((point) => [point.latitude, point.longitude] as [number, number])
      L.polyline(coordinates, { color: "#047857", weight: 5, opacity: 0.85 }).addTo(map)

      data.points.forEach((point, index) => {
        const isIncident = point.is_incident_point
        const marker = L.circleMarker([point.latitude, point.longitude], {
          radius: isIncident ? 9 : 5,
          color: isIncident ? "#dc2626" : "#0891b2",
          fillColor: isIncident ? "#ef4444" : "#22d3ee",
          fillOpacity: 0.9,
          weight: isIncident ? 3 : 2,
        }).addTo(map)
        marker.bindTooltip(
          `<strong>${isIncident ? "Violation point" : `Point ${index + 1}`}</strong><br/>` +
            `${formatTime(point.recorded_at)}<br/>Speed: ${point.speed_kph.toFixed(1)} km/h<br/>` +
            `Heading: ${point.heading == null ? "—" : `${Math.round(point.heading)}°`}`,
          { direction: "top" }
        )
      })

      const first = data.points[0]
      const last = data.points[data.points.length - 1]
      L.circleMarker([first.latitude, first.longitude], {
        radius: 7,
        color: "#166534",
        fillColor: "#22c55e",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map).bindTooltip("Trip window start")
      L.circleMarker([last.latitude, last.longitude], {
        radius: 7,
        color: "#1d4ed8",
        fillColor: "#3b82f6",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map).bindTooltip("Trip window end")

      const bounds = L.latLngBounds(coordinates)
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
      window.setTimeout(() => map.invalidateSize(), 80)
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [data, open])

  function close() {
    mapRef.current?.remove()
    mapRef.current = null
    setOpen(false)
  }

  const incidentPoint = data?.points.find((point) => point.is_incident_point) || null
  const maxSpeed = data?.points.length ? Math.max(...data.points.map((point) => point.speed_kph)) : 0

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void loadHistory()}>
        <History /> Show trip history
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline"><Route className="mr-1 size-3.5" /> Four-minute incident window</Badge>
                  <Badge variant="outline">{vehicleLabel}</Badge>
                </div>
                <h2 className="mt-2 text-xl font-semibold">Vehicle movement around the violation</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Two minutes before and two minutes after the detected event, loaded from telemetry history.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={close}>
                <X /><span className="sr-only">Close</span>
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              {loading ? (
                <div className="flex min-h-96 items-center justify-center rounded-2xl border bg-slate-50">
                  <div className="text-center"><Loader2 className="mx-auto size-7 animate-spin text-emerald-700" /><p className="mt-3 text-sm text-muted-foreground">Loading telemetry history…</p></div>
                </div>
              ) : error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div>
              ) : data ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">History points</p><p className="mt-1 text-xl font-semibold">{data.points.length}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Detected speed</p><p className="mt-1 text-xl font-semibold">{data.detected_speed_kph ?? "—"} km/h</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Maximum in window</p><p className="mt-1 text-xl font-semibold">{maxSpeed.toFixed(1)} km/h</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Allowed threshold</p><p className="mt-1 text-xl font-semibold">{data.allowed_speed_kph ?? "—"} km/h</p></div>
                  </div>

                  {data.points.length ? (
                    <div ref={mapElementRef} className="h-[52vh] min-h-[390px] w-full overflow-hidden rounded-2xl border bg-slate-100" />
                  ) : (
                    <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed bg-slate-50 text-center">
                      <div><MapPinned className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No telemetry points found</p><p className="mt-1 text-sm text-muted-foreground">There is no stored location history inside this four-minute window.</p></div>
                    </div>
                  )}

                  <div className="grid gap-3 lg:grid-cols-3">
                    <div className="rounded-2xl border p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Timer className="size-4 text-emerald-700" /> Time window</div><p className="mt-2 text-sm text-muted-foreground">{formatTime(data.window_start)} – {formatTime(data.window_end)}</p></div>
                    <div className="rounded-2xl border p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Navigation className="size-4 text-emerald-700" /> Incident point</div><p className="mt-2 text-sm text-muted-foreground">{incidentPoint ? `${incidentPoint.latitude.toFixed(6)}, ${incidentPoint.longitude.toFixed(6)}` : "Unavailable"}</p></div>
                    <div className="rounded-2xl border p-4"><div className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-emerald-700" /> Legend</div><p className="mt-2 text-sm text-muted-foreground">Green: start · Blue: end · Red: violation · Cyan: telemetry points</p></div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
