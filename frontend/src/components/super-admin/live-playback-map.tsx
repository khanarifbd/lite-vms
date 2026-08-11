"use client"

import "leaflet/dist/leaflet.css"

import { useEffect, useRef } from "react"

import type {
  MonitoringPlayback,
  MonitoringPlaybackPoint,
} from "@/features/super-admin/monitoring"

const BANGLADESH_CENTER: [number, number] = [23.685, 90.3563]
const FOLLOW_EDGE_BUFFER_RATIO = 0.12

function pointPosition(point: MonitoringPlaybackPoint): [number, number] {
  return [point.latitude, point.longitude]
}

function formatPointTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date)
}

function shouldRecenterPlayback(
  map: import("leaflet").Map,
  position: [number, number],
) {
  const safeViewport = map.getBounds().pad(-FOLLOW_EDGE_BUFFER_RATIO)
  return !safeViewport.contains(position)
}

function currentVehicleIcon(
  L: typeof import("leaflet"),
  point: MonitoringPlaybackPoint,
) {
  const heading = Number.isFinite(point.heading) ? point.heading || 0 : 0
  const size = 34

  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size}px;transform:rotate(${heading}deg)">
      <div style="position:absolute;inset:-6px;border:3px solid rgba(34,197,94,.28);border-radius:999px;background:rgba(255,255,255,.78)"></div>
      <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:0;height:0;border-left:${size / 2}px solid transparent;border-right:${size / 2}px solid transparent;border-bottom:${size}px solid #22c55e;filter:drop-shadow(0 4px 5px rgba(15,23,42,.35));"></div>
      <div style="position:absolute;left:50%;top:9px;transform:translateX(-50%);width:5px;height:15px;border-radius:999px;background:white;"></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -22],
  })
}

type LivePlaybackMapProps = {
  playback: MonitoringPlayback | null
  currentIndex: number
  followCurrent: boolean
  fitRequest: number
  onPointSelect?: (index: number) => void
  className?: string
}

export function LivePlaybackMap({
  playback,
  currentIndex,
  followCurrent,
  fitRequest,
  onPointSelect,
  className = "min-h-[560px]",
}: LivePlaybackMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const routeLayerRef = useRef<import("leaflet").LayerGroup | null>(null)
  const travelledRouteRef = useRef<import("leaflet").Polyline | null>(null)
  const currentMarkerRef = useRef<import("leaflet").Marker | null>(null)
  const onPointSelectRef = useRef(onPointSelect)

  useEffect(() => {
    onPointSelectRef.current = onPointSelect
  }, [onPointSelect])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let frame: number | null = null
    const resize = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        mapRef.current?.invalidateSize({ animate: false })
      })
    }

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize)
    observer?.observe(container)
    window.addEventListener("resize", resize)
    window.addEventListener("bnvp:layout-resize", resize)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", resize)
      window.removeEventListener("bnvp:layout-resize", resize)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const points = playback?.points ?? []
    const registrationNumber = playback?.registration_number ?? "Vehicle"
    let cancelled = false

    async function renderRoute() {
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
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map)

        mapRef.current = map
        routeLayerRef.current = L.layerGroup().addTo(map)
        window.setTimeout(() => map.invalidateSize(), 0)
      }

      const map = mapRef.current
      const layer = routeLayerRef.current
      if (!map || !layer) return

      layer.clearLayers()
      travelledRouteRef.current = null
      currentMarkerRef.current = null

      if (points.length === 0) {
        map.setView(BANGLADESH_CENTER, 7)
        return
      }

      const coordinates = points.map(pointPosition)

      L.polyline(coordinates, {
        color: "#64748b",
        weight: 5,
        opacity: 0.42,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer)

      travelledRouteRef.current = L.polyline([coordinates[0]], {
        color: "#22c55e",
        weight: 6,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer)

      L.circleMarker(coordinates[0], {
        radius: 7,
        color: "#15803d",
        fillColor: "#22c55e",
        fillOpacity: 1,
        weight: 3,
      })
        .bindTooltip("Playback start", { direction: "top" })
        .addTo(layer)

      L.circleMarker(coordinates[coordinates.length - 1], {
        radius: 7,
        color: "#be123c",
        fillColor: "#f43f5e",
        fillOpacity: 1,
        weight: 3,
      })
        .bindTooltip("Playback end", { direction: "top" })
        .addTo(layer)

      const sampleStep = Math.max(1, Math.ceil(points.length / 140))
      points.forEach((point, index) => {
        if (
          index !== 0 &&
          index !== points.length - 1 &&
          index % sampleStep !== 0
        ) {
          return
        }

        L.circleMarker(pointPosition(point), {
          radius: 3,
          color: "#ffffff",
          fillColor: "#0f766e",
          fillOpacity: 0.8,
          weight: 1,
        })
          .bindTooltip(
            `${formatPointTime(point.recorded_at)} · ${Math.round(point.speed_kph)} km/h`,
            { direction: "top" },
          )
          .on("click", () => onPointSelectRef.current?.(index))
          .addTo(layer)
      })

      const initialPoint = points[0]
      currentMarkerRef.current = L.marker(pointPosition(initialPoint), {
        icon: currentVehicleIcon(L, initialPoint),
        zIndexOffset: 1000,
      })
        .bindTooltip(
          `${registrationNumber} · ${Math.round(initialPoint.speed_kph)} km/h`,
          { permanent: false, direction: "right", offset: [18, 0] },
        )
        .addTo(layer)

      travelledRouteRef.current.setLatLngs([coordinates[0]])
      map.fitBounds(coordinates, { padding: [45, 45], maxZoom: 16 })
    }

    void renderRoute()
    return () => {
      cancelled = true
    }
  }, [playback])

  useEffect(() => {
    const points = playback?.points ?? []
    const registrationNumber = playback?.registration_number ?? "Vehicle"
    if (points.length === 0) return

    let cancelled = false

    async function updateCurrentPoint() {
      const L = await import("leaflet")
      if (cancelled) return

      const index = Math.min(Math.max(currentIndex, 0), points.length - 1)
      const point = points[index]
      const position = pointPosition(point)
      const marker = currentMarkerRef.current
      const travelled = travelledRouteRef.current
      const map = mapRef.current
      if (!marker || !travelled) return

      marker.setLatLng(position)
      marker.setIcon(currentVehicleIcon(L, point))
      marker.setTooltipContent(
        `${registrationNumber} · ${Math.round(point.speed_kph)} km/h`,
      )
      travelled.setLatLngs(points.slice(0, index + 1).map(pointPosition))

      if (followCurrent && map && shouldRecenterPlayback(map, position)) {
        map.panTo(position, {
          animate: true,
          duration: 0.35,
        })
      }
    }

    void updateCurrentPoint()
    return () => {
      cancelled = true
    }
  }, [currentIndex, followCurrent, playback])

  useEffect(() => {
    const points = playback?.points ?? []
    const map = mapRef.current
    if (!fitRequest || points.length === 0 || !map) return

    map.fitBounds(points.map(pointPosition), {
      padding: [45, 45],
      maxZoom: 16,
    })
  }, [fitRequest, playback])

  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      routeLayerRef.current = null
      travelledRouteRef.current = null
      currentMarkerRef.current = null
    }
  }, [])

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      <div
        ref={containerRef}
        className="absolute inset-0 z-0"
        aria-label="Vehicle playback route map"
      />

      {!playback?.points.length ? (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center bg-white/75 p-8 text-center backdrop-blur-sm">
          <div>
            <p className="font-semibold text-slate-900">
              Select a vehicle and load playback
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              The recorded route, speed and vehicle direction will appear here.
            </p>
          </div>
        </div>
      ) : null}

      {playback?.points.length ? (
        <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex items-center gap-4 rounded-2xl border bg-white/92 px-4 py-3 text-xs shadow-sm backdrop-blur">
          <span className="flex items-center gap-2">
            <i className="h-1 w-8 rounded-full bg-slate-400" />Full route
          </span>
          <span className="flex items-center gap-2">
            <i className="h-1 w-8 rounded-full bg-green-500" />Travelled
          </span>
          <span className="flex items-center gap-2">
            <i className="size-2.5 rounded-full bg-rose-500" />End
          </span>
        </div>
      ) : null}
    </div>
  )
}
