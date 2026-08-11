"use client"

import { History, MapPinned, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { FormEvent, useMemo, useState } from "react"

import { SpeedZoneMap, type ZonePoint } from "@/components/super-admin/speed-zone-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { EnforcementGeofence } from "@/features/super-admin/enforcement"

type HistoryItem = {
  id: number
  action: string
  reason: string | null
  created_at: string
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
}

function pointsFromGeometry(geometry: Record<string, unknown>): ZonePoint[] {
  if (geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) return []
  const firstRing = Array.isArray(geometry.coordinates[0]) ? geometry.coordinates[0] : []
  const points = firstRing.filter(isCoordinatePair).map(([lng, lat]) => ({ lat, lng }))
  if (points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]
    if (first.lat === last.lat && first.lng === last.lng) points.pop()
  }
  return points
}

function polygonGeometry(points: ZonePoint[]) {
  const ring = points.map((point) => [point.lng, point.lat])
  if (ring.length) ring.push([...ring[0]])
  return { type: "Polygon", coordinates: [ring] }
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/super-admin/enforcement${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || "Geofence request failed.")
  return payload
}

export function GeofenceRegistryManager({ initialItems }: { initialItems: EnforcementGeofence[] }) {
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<EnforcementGeofence | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [points, setPoints] = useState<ZonePoint[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [history, setHistory] = useState<{ item: EnforcementGeofence; rows: HistoryItem[] } | null>(null)

  const visibleItems = useMemo(() => {
    const value = search.trim().toLowerCase()
    if (!value) return items
    return items.filter((item) => `${item.name} ${item.description || ""}`.toLowerCase().includes(value))
  }, [items, search])

  function openCreate() {
    setEditing(null)
    setPoints([])
    setMessage(null)
    setFormOpen(true)
  }

  function openEdit(item: EnforcementGeofence) {
    setEditing(item)
    setPoints(pointsFromGeometry(item.geometry))
    setMessage(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (busy) return
    setFormOpen(false)
    setEditing(null)
    setPoints([])
    setMessage(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (points.length < 3) {
      setMessage("Map-এ কমপক্ষে ৩টি point দিয়ে area আঁকুন।")
      return
    }
    const form = new FormData(event.currentTarget)
    const wasEditing = Boolean(editing)
    const body = {
      name: String(form.get("name") || "").trim(),
      description: String(form.get("description") || "").trim() || null,
      geometry: polygonGeometry(points),
      enabled: form.get("enabled") === "true",
      ...(editing ? { change_note: String(form.get("change_note") || "").trim() } : {}),
    }

    setBusy(true)
    setMessage(null)
    try {
      const saved = await request(editing ? `/geofences/${editing.id}` : "/geofences", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body),
      }) as EnforcementGeofence
      setItems((current) => editing
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)))
      setFormOpen(false)
      setEditing(null)
      setPoints([])
      setMessage(wasEditing ? "Geofence updated successfully." : "Geofence created successfully.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save geofence.")
    } finally {
      setBusy(false)
    }
  }

  async function toggle(item: EnforcementGeofence) {
    const note = window.prompt(`Why are you ${item.enabled ? "disabling" : "enabling"} ${item.name}?`)
    if (!note || note.trim().length < 3) return
    setBusy(true)
    try {
      await request(`/geofences/${item.id}/enabled?enabled=${!item.enabled}&change_note=${encodeURIComponent(note.trim())}`, { method: "PATCH" })
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, enabled: !row.enabled } : row))
      setMessage(`Geofence ${item.enabled ? "disabled" : "enabled"} successfully.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change geofence status.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(item: EnforcementGeofence) {
    const note = window.prompt(`Delete ${item.name}? Enter a mandatory delete note.`)
    if (!note || note.trim().length < 3) return
    setBusy(true)
    try {
      await request(`/geofences/${item.id}?change_note=${encodeURIComponent(note.trim())}`, { method: "DELETE" })
      setItems((current) => current.filter((row) => row.id !== item.id))
      setMessage("Geofence deleted successfully.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete geofence.")
    } finally {
      setBusy(false)
    }
  }

  async function showHistory(item: EnforcementGeofence) {
    try {
      setHistory({ item, rows: await request(`/geofences/${item.id}/history`) as HistoryItem[] })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load geofence history.")
    }
  }

  return <>
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Geofence registry</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Create reusable polygon areas, then select them from Enforcement Rules.</p>
          </div>
          <Button onClick={openCreate} className="shrink-0 bg-emerald-800 hover:bg-emerald-900"><Plus /> Add geofence</Button>
        </div>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search geofence name or description" className="mt-4" />
        {message && !formOpen ? <p className={message.includes("successfully") ? "mt-3 text-sm text-emerald-700" : "mt-3 text-sm text-rose-700"}>{message}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3 p-4 sm:p-6">
        {visibleItems.map((item) => <div key={item.id} className="rounded-2xl border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><MapPinned className="size-5" /></div>
              <div><p className="font-semibold">{item.name}</p><p className="mt-1 text-sm text-muted-foreground">{item.description || "No description"}</p><p className="mt-1 text-xs text-muted-foreground">Updated {new Date(item.updated_at).toLocaleString()}</p></div>
            </div>
            <Badge variant="outline" className={item.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{item.enabled ? "Active" : "Disabled"}</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => openEdit(item)}><Pencil /> Edit</Button>
            <Button size="sm" variant="outline" onClick={() => void showHistory(item)}><History /> History</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle(item)}><Power /> {item.enabled ? "Disable" : "Enable"}</Button>
            <Button size="sm" variant="outline" disabled={busy} className="text-rose-700" onClick={() => void remove(item)}><Trash2 /> Delete</Button>
          </div>
        </div>)}
        {!visibleItems.length ? <div className="rounded-2xl border border-dashed bg-slate-50 p-10 text-center text-sm text-muted-foreground">No matching geofences found.</div> : null}
      </CardContent>
    </Card>

    <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit geofence" : "Add geofence"}</DialogTitle>
          <DialogDescription>Click around the map boundary. This area can be reused by multiple enforcement rules.</DialogDescription>
        </DialogHeader>
        <form key={editing?.id || "new"} className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">Geofence name<Input name="name" required defaultValue={editing?.name} placeholder="Mirpur Zone" /></label>
            <label className="grid gap-2 text-sm font-medium">Status<select name="enabled" defaultValue={String(editing?.enabled ?? true)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="true">Active</option><option value="false">Disabled</option></select></label>
          </div>
          <label className="grid gap-2 text-sm font-medium">Description<textarea name="description" defaultValue={editing?.description || ""} className="min-h-20 rounded-md border bg-white p-3 text-sm" placeholder="Area purpose or operational note" /></label>
          <SpeedZoneMap
            points={points}
            onChange={setPoints}
            title="Draw the geofence boundary"
            description="Map-এ boundary ঘিরে click করুন। কমপক্ষে ৩টি point লাগবে।"
          />
          {editing ? <label className="grid gap-2 text-sm font-medium">Change note<Input name="change_note" required minLength={3} placeholder="Explain why this geofence is being updated" /></label> : null}
          {message && formOpen ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{message}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">{busy ? "Saving…" : editing ? "Update geofence" : "Create geofence"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(history)} onOpenChange={(open) => { if (!open) setHistory(null) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>History — {history?.item.name}</DialogTitle><DialogDescription>Every update, status change and delete note is recorded.</DialogDescription></DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">{history?.rows.map((row) => <div key={row.id} className="rounded-xl border p-3 text-sm"><p className="font-medium">{row.action.replaceAll("_", " ")}</p><p className="mt-1 text-muted-foreground">{row.reason || "No note"}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p></div>)}{history && !history.rows.length ? <p className="text-sm text-muted-foreground">No history found.</p> : null}</div>
      </DialogContent>
    </Dialog>
  </>
}
