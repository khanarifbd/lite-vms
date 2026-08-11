"use client"

import { Building2, History, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { FormEvent, useMemo, useState } from "react"

import { flattenOrganizationTree, OrganizationTreeSelect } from "@/components/super-admin/organization-tree-select"
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

export type TenantItem = { public_id: string; code: string; name: string }
export type OrganizationItem = {
  public_id: string
  tenant_public_id: string
  tenant_name: string
  parent_public_id: string | null
  organization_type: string
  code: string
  name_en: string
  name_bn: string | null
  registration_number: string | null
  status: string
}

type HistoryItem = { id: number; action: string; actor_user_id: number | null; change_note: string | null; created_at: string }

const types = [
  ["system", "National platform / system"],
  ["bangladesh_police", "Bangladesh Police"],
  ["brta", "BRTA"],
  ["brtc", "BRTC"],
  ["government_agency", "Other government agency"],
  ["auditor", "Auditor"],
] as const

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/super-admin/organizations${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || "Organization request failed.")
  return payload
}

export function OrganizationRegistryManager({ tenants, initialItems }: { tenants: TenantItem[]; initialItems: OrganizationItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [editing, setEditing] = useState<OrganizationItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [history, setHistory] = useState<{ item: OrganizationItem; rows: HistoryItem[] } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [listSearch, setListSearch] = useState("")
  const nationalTenant = useMemo(() => tenants.find((item) => item.name.toLowerCase().includes("national vehicle platform")) || tenants[0], [tenants])
  const availableParents = items.filter((item) => item.tenant_public_id === nationalTenant?.public_id)
  const treeItems = useMemo(() => flattenOrganizationTree(availableParents), [availableParents])
  const normalizedSearch = listSearch.trim().toLocaleLowerCase()
  const visibleTree = normalizedSearch
    ? treeItems.filter((item) => `${item.name_bn || ""} ${item.name_en} ${item.code} ${item.organization_type}`.toLocaleLowerCase().includes(normalizedSearch))
    : treeItems

  function openCreate() {
    setEditing(null)
    setMessage(null)
    setFormOpen(true)
  }

  function openEdit(item: OrganizationItem) {
    setEditing(item)
    setMessage(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (busy) return
    setFormOpen(false)
    setEditing(null)
    setMessage(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!nationalTenant) return setMessage("National Vehicle Platform tenant not found.")
    const form = new FormData(event.currentTarget)
    const wasEditing = Boolean(editing)
    const body = {
      tenant_public_id: nationalTenant.public_id,
      parent_public_id: form.get("parent_public_id") || null,
      organization_type: form.get("organization_type"),
      code: String(form.get("code") || "").trim().toUpperCase(),
      name_en: String(form.get("name_en") || "").trim(),
      name_bn: String(form.get("name_bn") || "").trim() || null,
      registration_number: String(form.get("registration_number") || "").trim() || null,
      status: form.get("status") || "active",
      ...(editing ? { change_note: String(form.get("change_note") || "").trim() } : {}),
    }
    setBusy(true)
    setMessage(null)
    try {
      const saved = await api(editing ? `/${editing.public_id}` : "", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body),
      }) as OrganizationItem
      setItems((current) => editing
        ? current.map((item) => item.public_id === saved.public_id ? saved : item)
        : [...current, saved])
      setMessage(wasEditing ? "Organization updated successfully." : "Organization created successfully.")
      setEditing(null)
      setFormOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save organization.")
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(item: OrganizationItem) {
    const next = item.status === "active" ? "disabled" : "active"
    const note = window.prompt(`Why are you changing ${item.name_en} to ${next}?`)
    if (!note || note.trim().length < 3) return
    setBusy(true)
    try {
      const saved = await api(`/${item.public_id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next, change_note: note.trim() }),
      }) as OrganizationItem
      setItems((current) => current.map((row) => row.public_id === saved.public_id ? saved : row))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change status.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(item: OrganizationItem) {
    const note = window.prompt(`Delete ${item.name_en}? Enter a mandatory delete note.`)
    if (!note || note.trim().length < 3) return
    setBusy(true)
    try {
      await api(`/${item.public_id}`, {
        method: "DELETE",
        body: JSON.stringify({ change_note: note.trim() }),
      })
      setItems((current) => current.filter((row) => row.public_id !== item.public_id))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete organization.")
    } finally {
      setBusy(false)
    }
  }

  async function showHistory(item: OrganizationItem) {
    try {
      setHistory({ item, rows: await api(`/${item.public_id}/history`) as HistoryItem[] })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load history.")
    }
  }

  return <>
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Organization hierarchy</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Manage Bangladesh Police, BRTA, BRTC, other root agencies and all child organizations from one registry.</p>
          </div>
          <Button onClick={openCreate} className="shrink-0 bg-emerald-800 hover:bg-emerald-900"><Plus /> Add organization</Button>
        </div>
        <Input value={listSearch} onChange={(event) => setListSearch(event.target.value)} placeholder="Search organization name, Bangla name or code" className="mt-4" />
        {message && !formOpen ? <p className={message.includes("successfully") ? "mt-3 text-sm text-emerald-700" : "mt-3 text-sm text-rose-700"}>{message}</p> : null}
      </CardHeader>
      <CardContent className="space-y-2 p-4 sm:p-6">
        {visibleTree.map((item) => {
          const parent = items.find((candidate) => candidate.public_id === item.parent_public_id)
          return <div key={item.public_id} className="rounded-2xl border bg-white p-4" style={{ marginLeft: normalizedSearch ? 0 : `${Math.min(item.depth, 4) * 22}px` }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 className="size-5" /></div>
                <div>
                  <p className="font-semibold">{item.depth ? "└─ " : ""}{item.name_bn || item.name_en}</p>
                  <p className="text-sm text-muted-foreground">{item.name_en} · {item.code} · {item.organization_type.replaceAll("_", " ")}</p>
                  {parent ? <p className="mt-1 text-xs text-muted-foreground">Under: {parent.name_bn || parent.name_en}</p> : <p className="mt-1 text-xs text-emerald-700">Root organization</p>}
                </div>
              </div>
              <Badge variant="outline" className={item.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{item.status}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(item)}><Pencil /> Edit</Button>
              <Button size="sm" variant="outline" onClick={() => void showHistory(item)}><History /> History</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeStatus(item)}><Power /> {item.status === "active" ? "Disable" : "Enable"}</Button>
              <Button size="sm" variant="outline" disabled={busy} className="text-rose-700" onClick={() => void remove(item)}><Trash2 /> Delete</Button>
            </div>
          </div>
        })}
        {!visibleTree.length ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No matching organizations found.</div> : null}
        {history ? <div className="rounded-2xl border bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-semibold">History — {history.item.name_en}</p><p className="text-xs text-muted-foreground">Every update, status change and deletion note is recorded.</p></div>
            <Button size="sm" variant="ghost" onClick={() => setHistory(null)}>Close</Button>
          </div>
          <div className="mt-3 space-y-2">{history.rows.map((row) => <div key={row.id} className="rounded-xl bg-white p-3 text-sm"><p className="font-medium">{row.action.replaceAll("_", " ")}</p><p className="mt-1 text-muted-foreground">{row.change_note || "No note"}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p></div>)}</div>
        </div> : null}
      </CardContent>
    </Card>

    <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit organization" : "Add organization"}</DialogTitle>
          <DialogDescription>Create a root agency or select a parent to add a division, district, upazila, branch or other child organization.</DialogDescription>
        </DialogHeader>
        <form key={editing?.public_id || "new"} className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">Organization type
            <select name="organization_type" defaultValue={editing?.organization_type || "government_agency"} className="h-10 rounded-md border bg-white px-3 text-sm">{types.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select>
          </label>
          <label className="grid gap-2 text-sm font-medium">Parent organization
            <OrganizationTreeSelect name="parent_public_id" items={availableParents} defaultValue={editing?.parent_public_id || ""} excludeBranchId={editing?.public_id} help="Keep Root selected for Bangladesh Police, BRTA, BRTC or another top-level agency. Select a parent for division, district, upazila or unit." />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">Code<Input name="code" required defaultValue={editing?.code} placeholder="DHAKA-DIVISION" /></label>
            <label className="grid gap-2 text-sm font-medium">Status
              <select name="status" defaultValue={editing?.status || "active"} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option><option value="disabled">Disabled</option></select>
            </label>
          </div>
          <label className="grid gap-2 text-sm font-medium">English name<Input name="name_en" required defaultValue={editing?.name_en} placeholder="Dhaka Division" /></label>
          <label className="grid gap-2 text-sm font-medium">Bangla name<Input name="name_bn" defaultValue={editing?.name_bn || ""} placeholder="ঢাকা বিভাগ" /></label>
          <label className="grid gap-2 text-sm font-medium">Registration / official reference<Input name="registration_number" defaultValue={editing?.registration_number || ""} /></label>
          {editing ? <label className="grid gap-2 text-sm font-medium">Change note<Input name="change_note" required minLength={3} placeholder="Explain why this organization is being updated" /></label> : null}
          {message && formOpen ? <p className={message.includes("successfully") ? "text-sm text-emerald-700" : "text-sm text-rose-700"}>{message}</p> : null}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">{busy ? "Saving…" : editing ? "Update organization" : "Create organization"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
