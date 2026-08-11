"use client"

import "leaflet/dist/leaflet.css"

import L from "leaflet"
import { LocateFixed, MapPinPlus, RotateCcw, Search, Trash2, Undo2 } from "lucide-react"
import { KeyboardEvent, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type ZonePoint = { lat: number; lng: number }

type SearchResult = {
  display_name: string
  lat: string
  lon: string
  boundingbox?: string[]
}

type SpeedZoneMapProps = {
  points: ZonePoint[]
  onChange: (points: ZonePoint[]) => void
  title?: string
  description?: string
}

const pointIcon = (index: number) => L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;border-radius:9999px;background:#047857;color:white;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${index + 1}</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

export function SpeedZoneMap({
  points,
  onChange,
  title = "Draw the geofence boundary",
}: SpeedZoneMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const polygonRef = useRef<L.Polygon | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const searchMarkerRef = useRef<L.Marker | null>(null)
  const pointsRef = useRef(points)
  const onChangeRef = useRef(onChange)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [manualLat, setManualLat] = useState("")
  const [manualLng, setManualLng] = useState("")

  useEffect(() => { pointsRef.current = points }, [points])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return

    const map = L.map(mapElementRef.current, { zoomControl: true }).setView([23.8041, 90.3667], 13)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map)

    map.on("click", (event: L.LeafletMouseEvent) => {
      onChangeRef.current([...pointsRef.current, { lat: event.latlng.lat, lng: event.latlng.lng }])
    })
    mapRef.current = map
    window.setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    polygonRef.current?.remove()
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    points.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lng], {
        draggable: true,
        icon: pointIcon(index),
        title: `Boundary point ${index + 1}`,
      }).addTo(map)
      marker.bindTooltip(`Point ${index + 1} — drag to adjust`, { direction: "top" })
      marker.on("dragend", () => {
        const next = [...pointsRef.current]
        const position = marker.getLatLng()
        next[index] = { lat: position.lat, lng: position.lng }
        onChangeRef.current(next)
      })
      marker.on("contextmenu", () => {
        onChangeRef.current(pointsRef.current.filter((_, pointIndex) => pointIndex !== index))
      })
      markersRef.current.push(marker)
    })

    if (points.length >= 2) {
      polygonRef.current = L.polygon(points.map((point) => [point.lat, point.lng] as L.LatLngTuple), {
        weight: 3,
        fillOpacity: points.length >= 3 ? 0.2 : 0,
      }).addTo(map)
    }
  }, [points])

  async function searchPlace() {
    const value = query.trim()
    if (value.length < 3) {
      setSearchError("Enter at least 3 characters.")
      return
    }
    setSearching(true)
    setSearchError(null)
    setResults([])
    try {
      const response = await fetch(`/api/geocoding/search?q=${encodeURIComponent(value)}`, { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || "Unable to search for this location.")
      setResults(Array.isArray(payload) ? payload : [])
      if (!payload?.length) setSearchError("No matching locations found.")
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Unable to search for this location.")
    } finally {
      setSearching(false)
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return
    event.preventDefault()
    event.stopPropagation()
    void searchPlace()
  }

  function focusResult(result: SearchResult) {
    const map = mapRef.current
    if (!map) return
    const lat = Number(result.lat)
    const lng = Number(result.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    searchMarkerRef.current?.remove()
    searchMarkerRef.current = L.marker([lat, lng]).addTo(map).bindPopup(result.display_name).openPopup()
    if (result.boundingbox?.length === 4) {
      const [south, north, west, east] = result.boundingbox.map(Number)
      if ([south, north, west, east].every(Number.isFinite)) map.fitBounds([[south, west], [north, east]], { padding: [30, 30] })
      else map.setView([lat, lng], 16)
    } else {
      map.setView([lat, lng], 16)
    }
    setResults([])
    setQuery(result.display_name)
  }

  function addManualPoint() {
    const lat = Number(manualLat)
    const lng = Number(manualLng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setSearchError("Enter valid latitude and longitude values.")
      return
    }
    onChange([...points, { lat, lng }])
    mapRef.current?.setView([lat, lng], Math.max(mapRef.current.getZoom(), 16))
    setManualLat("")
    setManualLng("")
    setSearchError(null)
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-white">
      <div className="space-y-4 border-b px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">Search for an area, then click around its boundary. At least 3 points are required. Drag numbered points to adjust the shape.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!points.length} onClick={() => onChange(points.slice(0, -1))}><Undo2 /> Undo</Button>
            <Button type="button" variant="outline" size="sm" disabled={!points.length} onClick={() => onChange([])}><RotateCcw /> Clear area</Button>
          </div>
        </div>

        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} className="pl-9" placeholder="Search area, road, district or landmark" />
          </div>
          <Button type="button" variant="outline" disabled={searching} onClick={() => void searchPlace()}>{searching ? "Searching…" : "Search"}</Button>
          {results.length ? <div className="absolute left-0 right-0 top-12 z-[1000] max-h-64 overflow-auto rounded-xl border bg-white p-1 shadow-xl">{results.map((result, index) => <button key={`${result.lat}-${result.lon}-${index}`} type="button" onClick={() => focusResult(result)} className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-emerald-50"><LocateFixed className="mt-0.5 size-4 shrink-0 text-emerald-700" /><span>{result.display_name}</span></button>)}</div> : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input value={manualLat} onChange={(event) => setManualLat(event.target.value)} inputMode="decimal" placeholder="Latitude, e.g. 23.8041" />
          <Input value={manualLng} onChange={(event) => setManualLng(event.target.value)} inputMode="decimal" placeholder="Longitude, e.g. 90.3667" />
          <Button type="button" variant="outline" onClick={addManualPoint}><MapPinPlus /> Add point</Button>
        </div>
        {searchError ? <p className="text-sm text-rose-700">{searchError}</p> : null}
      </div>

      <div ref={mapElementRef} className="h-[480px] w-full" />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
        <span>{points.length >= 3 ? `${points.length} boundary points selected. The polygon is ready.` : `${points.length}/3 minimum boundary points selected.`}</span>
        <span className="flex items-center gap-1"><Trash2 className="size-3.5" /> Right-click a point to remove it.</span>
      </div>
    </div>
  )
}
