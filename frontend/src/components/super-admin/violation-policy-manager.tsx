"use client"

import { History, Pencil, Plus, Power, Scale, Trash2 } from "lucide-react"
import { FormEvent, useMemo, useState } from "react"

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
import type { EnforcementPolicy } from "@/features/super-admin/enforcement"

const selectClass = "h-10 rounded-md border bg-white px-3 text-sm"

type HistoryItem = {
  id: number
  action: string
  reason: string | null
  created_at: string
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/super-admin/enforcement${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || "Unable to process violation policy request.")
  return payload
}

function policyPayload(form: FormData, editing: EnforcementPolicy | null) {
  return {
    name: String(form.get("name") || "").trim(),
    violation_type: form.get("violation_type"),
    scope: "national",
    severity: form.get("severity"),
    minimum_duration_seconds: Number(form.get("minimum_duration_seconds")),
    minimum_consecutive_packets: Number(form.get("minimum_consecutive_packets")),
    cooldown_seconds: Number(form.get("cooldown_seconds")),
    acceptable_packet_delay_seconds: Number(form.get("acceptable_packet_delay_seconds")),
    review_required: true,
    auto_create_candidate: true,
    auto_create_case: false,
    enabled: form.get("enabled") === "true",
    effective_from: null,
    effective_to: null,
    legal_reference: String(form.get("legal_reference") || "").trim() || null,
    notes: String(form.get("notes") || "").trim() || null,
    ...(editing ? { change_note: String(form.get("change_note") || "").trim() } : {}),
  }
}

export function ViolationPolicyManager({ initialItems }: { initialItems: EnforcementPolicy[] }) {
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<EnforcementPolicy | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [history, setHistory] = useState<{ item: EnforcementPolicy; rows: HistoryItem[] } | null>(null)

  const visibleItems = useMemo(() => {
    const value = search.trim().toLowerCase()
    if (!value) return items
    return items.filter((item) => `${item.name} ${item.violation_type} ${item.severity}`.toLowerCase().includes(value))
  }, [items, search])

  function openCreate() {
    setEditing(null)
    setMessage(null)
    setFormOpen(true)
  }

  function openEdit(item: EnforcementPolicy) {
    setEditing(item)
    setMessage(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (busy) return
    setEditing(null)
    setFormOpen(false)
    setMessage(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = policyPayload(new FormData(event.currentTarget), editing)
    setBusy(true)
    setMessage(null)
    try {
      const saved = await request(editing ? `/policies/${editing.id}` : "/policies", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body),
      }) as EnforcementPolicy
      setItems((current) => editing
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)))
      setFormOpen(false)
      setEditing(null)
      setMessage(editing ? "Violation policy updated successfully." : "Violation policy created successfully.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save violation policy.")
    } finally {
      setBusy(false)
    }
  }

  async function toggle(item: EnforcementPolicy) {
    const note = window.prompt(`Why are you ${item.enabled ? "disabling" : "enabling"} ${item.name}?`)
    if (!note || note.trim().length < 3) return
    setBusy(true)
    setMessage(null)
    try {
      const saved = await request(`/policies/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...item, enabled: !item.enabled, change_note: note.trim() }),
      }) as EnforcementPolicy
      setItems((current) => current.map((row) => row.id === saved.id ? saved : row))
      setMessage(`Violation policy ${saved.enabled ? "enabled" : "disabled"} successfully.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change policy status.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(item: EnforcementPolicy) {
    const note = window.prompt(`Delete ${item.name}? Enter a mandatory delete note.`)
    if (!note || note.trim().length < 3) return
    setBusy(true)
    setMessage(null)
    try {
      await request(`/policies/${item.id}?change_note=${encodeURIComponent(note.trim())}`, { method: "DELETE" })
      setItems((current) => current.filter((row) => row.id !== item.id))
      setMessage("Violation policy deleted successfully.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete violation policy.")
    } finally {
      setBusy(false)
    }
  }

  async function showHistory(item: EnforcementPolicy) {
    try {
      setHistory({ item, rows: await request(`/policies/${item.id}/history`) as HistoryItem[] })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load policy history.")
    }
  }

  return <>
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Violation policies</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Reusable detection settings for overspeed, geofence, and route violations.</p>
          </div>
          {items.length ? <Button onClick={openCreate} className="shrink-0 bg-emerald-800 hover:bg-emerald-900"><Plus /> Create policy</Button> : null}
        </div>
        {items.length ? <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search policy name, type, or severity" className="mt-4" /> : null}
        {message && !formOpen ? <p className={message.includes("successfully") ? "mt-3 text-sm text-emerald-700" : "mt-3 text-sm text-rose-700"}>{message}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3 p-4 sm:p-6">
        {!items.length ? <div className="rounded-2xl border border-dashed bg-slate-50 p-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Scale className="size-6" /></div>
          <p className="mt-4 font-semibold">No violation policies configured yet</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Create the first reusable policy before adding national or geofence-based enforcement rules.</p>
          <Button onClick={openCreate} className="mt-5 bg-emerald-800 hover:bg-emerald-900"><Plus /> Create policy</Button>
        </div> : null}

        {visibleItems.map((item) => <div key={item.id} className="rounded-2xl border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Scale className="size-5" /></div>
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-sm capitalize text-muted-foreground">{item.violation_type.replaceAll("_", " ")} · {item.severity} severity</p>
              </div>
            </div>
            <Badge variant="outline" className={item.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}>{item.enabled ? "Active" : "Disabled"}</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3 text-center"><p className="font-semibold">{item.minimum_duration_seconds}s</p><p className="text-xs text-muted-foreground">Minimum duration</p></div>
            <div className="rounded-xl bg-slate-50 p-3 text-center"><p className="font-semibold">{item.minimum_consecutive_packets}</p><p className="text-xs text-muted-foreground">Required packets</p></div>
            <div className="rounded-xl bg-slate-50 p-3 text-center"><p className="font-semibold">{item.cooldown_seconds}s</p><p className="text-xs text-muted-foreground">Duplicate cooldown</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => openEdit(item)}><Pencil /> Edit</Button>
            <Button size="sm" variant="outline" onClick={() => void showHistory(item)}><History /> History</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle(item)}><Power /> {item.enabled ? "Disable" : "Enable"}</Button>
            <Button size="sm" variant="outline" disabled={busy} className="text-rose-700" onClick={() => void remove(item)}><Trash2 /> Delete</Button>
          </div>
        </div>)}
        {items.length && !visibleItems.length ? <div className="rounded-2xl border border-dashed bg-slate-50 p-10 text-center text-sm text-muted-foreground">No matching violation policies found.</div> : null}
      </CardContent>
    </Card>

    <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit violation policy" : "Create violation policy"}</DialogTitle>
          <DialogDescription>Configure reusable detection behavior. Area and police organization are selected later in Enforcement Rules.</DialogDescription>
        </DialogHeader>
        <form key={editing?.id || "new"} className="space-y-5" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">Policy name<Input name="name" required minLength={3} defaultValue={editing?.name} placeholder="Standard overspeed policy" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">Violation type<select name="violation_type" defaultValue={editing?.violation_type || "overspeed"} className={selectClass}><option value="overspeed">Overspeed</option><option value="geofence_violation">Geofence violation</option><option value="route_violation">Route violation</option></select></label>
            <label className="grid gap-2 text-sm font-medium">Severity<select name="severity" defaultValue={editing?.severity || "medium"} className={selectClass}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">Minimum duration (seconds)<Input name="minimum_duration_seconds" type="number" min="0" max="3600" required defaultValue={editing?.minimum_duration_seconds ?? 10} /></label>
            <label className="grid gap-2 text-sm font-medium">Minimum consecutive packets<Input name="minimum_consecutive_packets" type="number" min="1" max="100" required defaultValue={editing?.minimum_consecutive_packets ?? 3} /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">Duplicate cooldown (seconds)<Input name="cooldown_seconds" type="number" min="0" max="86400" required defaultValue={editing?.cooldown_seconds ?? 300} /></label>
            <label className="grid gap-2 text-sm font-medium">Maximum packet delay (seconds)<Input name="acceptable_packet_delay_seconds" type="number" min="0" max="3600" required defaultValue={editing?.acceptable_packet_delay_seconds ?? 120} /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">Status<select name="enabled" defaultValue={String(editing?.enabled ?? true)} className={selectClass}><option value="true">Active</option><option value="false">Disabled</option></select></label>
            <label className="grid gap-2 text-sm font-medium">Legal reference (optional)<Input name="legal_reference" defaultValue={editing?.legal_reference || ""} placeholder="Road Transport Act, section ..." /></label>
          </div>
          <label className="grid gap-2 text-sm font-medium">Internal notes (optional)<textarea name="notes" defaultValue={editing?.notes || ""} className="min-h-24 rounded-md border bg-white p-3 text-sm" placeholder="Operational or implementation notes" /></label>
          {editing ? <label className="grid gap-2 text-sm font-medium">Change note<Input name="change_note" required minLength={3} placeholder="Explain why this policy is being updated" /></label> : null}
          {message && formOpen ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{message}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">{busy ? "Saving…" : editing ? "Update policy" : "Create policy"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(history)} onOpenChange={(open) => { if (!open) setHistory(null) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>History — {history?.item.name}</DialogTitle><DialogDescription>Every policy change and its mandatory note are shown below.</DialogDescription></DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">{history?.rows.map((row) => <div key={row.id} className="rounded-xl border p-3 text-sm"><p className="font-medium">{row.action.replaceAll("_", " ")}</p><p className="mt-1 text-muted-foreground">{row.reason || "No note"}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p></div>)}{history && !history.rows.length ? <p className="text-sm text-muted-foreground">No history found.</p> : null}</div>
      </DialogContent>
    </Dialog>
  </>
}
