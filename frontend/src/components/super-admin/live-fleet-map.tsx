"use client"

import "leaflet/dist/leaflet.css"

import { useEffect, useRef } from "react"

import type { MonitoringVehicle } from "@/features/super-admin/monitoring"

const BANGLADESH_CENTER: [number, number] = [23.685, 90.3563]
const VIEWPORT_EDGE_PADDING = -0.08

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function markerColor(vehicle: MonitoringVehicle) {
  if (vehicle.movement_state === "no_data") return "#94a3b8"
  if (vehicle.movement_state === "offline") return "#e11d48"
  if (vehicle.movement_state === "moving") return "#84cc16"
  if (vehicle.movement_state === "idle") return "#f97316"
  return "#0ea5e9"
}

type LiveFleetMapProps = {
  vehicles: MonitoringVehicle[]
  selectedVehicleId?: string | null
  onVehicleSelect?: (vehicleId: string) => void
  className?: string
}

export function LiveFleetMap({
  vehicles,
  selectedVehicleId = null,
  onVehicleSelect,
  className = "min-h-[520px]",
}: LiveFleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null)
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map())
  const selectHandlerRef = useRef(onVehicleSelect)
  const previousSelectedVehicleIdRef = useRef<string | null>(null)
  const previousSelectedPositionRef = useRef<[number, number] | null>(null)
  const initialFitCompletedRef = useRef(false)

  useEffect(() => {
    selectHandlerRef.current = onVehicleSelect
  }, [onVehicleSelect])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let animationFrame: number | null = null
    const invalidateMapSize = () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        mapRef.current?.invalidateSize({ animate: false })
      })
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidateMapSize)
    resizeObserver?.observe(container)
    window.addEventListener("resize", invalidateMapSize)
    window.addEventListener("bnvp:layout-resize", invalidateMapSize)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener("resize", invalidateMapSize)
      window.removeEventListener("bnvp:layout-resize", invalidateMapSize)
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function renderMap() {
      if (!containerRef.current) return
      const L = await import("leaflet")
      if (cancelled || !containerRef.current) return

      if (!mapRef.current) {
        const map = L.map(containerRef.current, {
          center: BANGLADESH_CENTER,
          zoom: 7,
          minZoom: 6,
          maxZoom: 19,
          zoomControl: true,
          preferCanvas: true,
        })

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map)

        mapRef.current = map
        layerRef.current = L.layerGroup().addTo(map)
        window.setTimeout(() => map.invalidateSize(), 0)
      }

      const map = mapRef.current
      const layer = layerRef.current
      if (!map || !layer) return

      layer.clearLayers()
      markersRef.current.clear()
      const bounds: [number, number][] = []

      for (const vehicle of vehicles) {
        if (vehicle.latitude == null || vehicle.longitude == null) continue
        if (!Number.isFinite(vehicle.latitude) || !Number.isFinite(vehicle.longitude)) continue

        const position: [number, number] = [vehicle.latitude, vehicle.longitude]
        bounds.push(position)
        const color = markerColor(vehicle)
        const registration = escapeHtml(vehicle.registration_number_display || vehicle.registration_number)
        const speed = Math.round(vehicle.speed_kph || 0)
        const selected = vehicle.id === selectedVehicleId
        const size = selected ? 30 : 24
        const heading = Number.isFinite(vehicle.heading) ? vehicle.heading || 0 : 0

        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;width:${size}px;height:${size}px;transform:rotate(${heading}deg)">
            <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:0;height:0;border-left:${size / 2}px solid transparent;border-right:${size / 2}px solid transparent;border-bottom:${size}px solid ${color};filter:drop-shadow(0 3px 4px rgba(15,23,42,.35));"></div>
            <div style="position:absolute;left:50%;top:7px;transform:translateX(-50%);width:5px;height:${Math.max(8, size - 12)}px;border-radius:999px;background:white;"></div>
            ${selected ? `<div style="position:absolute;inset:-5px;border:3px solid ${color};border-radius:999px;opacity:.35"></div>` : ""}
          </div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })

        const marker = L.marker(position, { icon, title: registration })
          .bindTooltip(`${registration} (${speed} km/h)`, {
            permanent: false,
            direction: "right",
            offset: [12, 0],
          })
          .on("click", () => selectHandlerRef.current?.(vehicle.id))
          .addTo(layer)

        markersRef.current.set(vehicle.id, marker)
      }

      const previousSelectedVehicleId = previousSelectedVehicleIdRef.current

      if (selectedVehicleId) {
        const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId)
        const selectedMarker = markersRef.current.get(selectedVehicleId)

        if (
          selectedVehicle?.latitude != null &&
          selectedVehicle.longitude != null &&
          selectedMarker
        ) {
          const position: [number, number] = [
            selectedVehicle.latitude,
            selectedVehicle.longitude,
          ]
          const isNewSelection = previousSelectedVehicleId !== selectedVehicleId
          const previousPosition = previousSelectedPositionRef.current
          const positionChanged =
            !previousPosition ||
            previousPosition[0] !== position[0] ||
            previousPosition[1] !== position[1]

          previousSelectedVehicleIdRef.current = selectedVehicleId
          previousSelectedPositionRef.current = position
          initialFitCompletedRef.current = true

          if (isNewSelection) {
            map.setView(position, Math.max(map.getZoom(), 15), { animate: true })
            return
          }

          if (
            positionChanged &&
            !map.getBounds().pad(VIEWPORT_EDGE_PADDING).contains(position)
          ) {
            map.panTo(position, { animate: true, duration: 0.5 })
          }
          return
        }
      }

      if (previousSelectedVehicleId && !selectedVehicleId) {
        previousSelectedVehicleIdRef.current = null
        previousSelectedPositionRef.current = null

        if (bounds.length === 1) map.setView(bounds[0], 15)
        else if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
        } else {
          map.setView(BANGLADESH_CENTER, 7)
        }
        initialFitCompletedRef.current = true
        return
      }

      if (!selectedVehicleId) {
        previousSelectedVehicleIdRef.current = null
        previousSelectedPositionRef.current = null
      }

      if (!initialFitCompletedRef.current) {
        if (bounds.length === 1) map.setView(bounds[0], 15)
        else if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
        } else {
          map.setView(BANGLADESH_CENTER, 7)
        }
        initialFitCompletedRef.current = true
      }
    }

    void renderMap()
    return () => {
      cancelled = true
    }
  }, [selectedVehicleId, vehicles])

  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      layerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      <div
        ref={containerRef}
        className="absolute inset-0 z-0"
        aria-label="Bangladesh live vehicle tracking map"
      />
      {!vehicles.some((vehicle) => vehicle.latitude != null && vehicle.longitude != null) ? (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center bg-white/75 p-6 text-center backdrop-blur-sm">
          <div>
            <p className="font-semibold text-slate-900">No vehicle coordinates available</p>
            <p className="mt-1 text-sm text-slate-500">
              The map will populate after valid GPS telemetry is received.
            </p>
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex flex-wrap gap-3 rounded-2xl border bg-white/90 px-4 py-3 text-xs shadow-sm backdrop-blur">
        <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-lime-500" />Moving</span>
        <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-orange-500" />Idle</span>
        <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-sky-500" />Stopped</span>
        <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-rose-600" />Offline</span>
        <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-slate-400" />No data</span>
      </div>
    </div>
  )
}
