"use client"

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type VehiclePickerItem = {
  id: string
  registration_number: string
  registration_number_display: string | null
  vehicle_type: string
  vehicle_category: string | null
  brand: string | null
  model: string | null
  owner_name: string | null
  imei: string | null
  provider_name: string | null
}

type VehiclePickerPage = {
  items: VehiclePickerItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

type Props = {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

async function loadVehicles(params: URLSearchParams): Promise<VehiclePickerPage> {
  const response = await fetch(`/api/super-admin/enforcement/vehicle-picker?${params.toString()}`, { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || "Unable to load vehicles.")
  return payload
}

function label(item: VehiclePickerItem) {
  return item.registration_number_display || item.registration_number
}

export function EnforcementVehiclePicker({ selectedIds, onChange }: Props) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<VehiclePickerPage | null>(null)
  const [selectedItems, setSelectedItems] = useState<Record<string, VehiclePickerItem>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ page: String(page), page_size: "20" })
    if (debouncedQuery) params.set("search", debouncedQuery)
    async function loadPage() {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      setError(null)
      try {
        setResult(await loadVehicles(params))
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Unable to load vehicles.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadPage()
    return () => { cancelled = true }
  }, [debouncedQuery, page])

  useEffect(() => {
    const missing = selectedIds.filter((id) => !selectedItems[id])
    if (!missing.length) return
    let cancelled = false
    const params = new URLSearchParams({ page_size: "50" })
    missing.slice(0, 200).forEach((id) => params.append("ids", id))
    void loadVehicles(params).then((payload) => {
      if (cancelled) return
      setSelectedItems((current) => ({
        ...current,
        ...Object.fromEntries(payload.items.map((item) => [item.id, item])),
      }))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [selectedIds, selectedItems])

  const selected = useMemo(
    () => selectedIds.map((id) => selectedItems[id]).filter((item): item is VehiclePickerItem => Boolean(item)),
    [selectedIds, selectedItems],
  )

  function toggle(item: VehiclePickerItem) {
    setSelectedItems((current) => ({ ...current, [item.id]: item }))
    onChange(selectedIds.includes(item.id)
      ? selectedIds.filter((id) => id !== item.id)
      : [...selectedIds, item.id])
  }

  return <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
    <div>
      <p className="text-sm font-medium">Select vehicles</p>
      <p className="mt-1 text-xs text-muted-foreground">Search by registration number, IMEI, chassis, engine, owner, provider, brand, or model. Results are loaded from the server in pages.</p>
    </div>

    {selected.length ? <div className="flex flex-wrap gap-2">
      {selected.map((item) => <button key={item.id} type="button" onClick={() => toggle(item)} className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs">
        <span className="font-medium">{label(item)}</span>
        <span className="text-muted-foreground">{item.vehicle_category || item.vehicle_type}</span>
        <X className="size-3" />
      </button>)}
    </div> : null}

    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search registration, IMEI, owner, provider…" className="pl-9" />
    </div>

    {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="grid grid-cols-[44px_1.2fr_1fr_1fr] gap-3 border-b bg-slate-50 px-3 py-2 text-xs font-medium text-muted-foreground">
        <span />
        <span>Vehicle</span>
        <span>Owner / Provider</span>
        <span>IMEI</span>
      </div>
      {loading ? <div className="p-6 text-center text-sm text-muted-foreground">Loading vehicles…</div> : result?.items.length ? result.items.map((item) => {
        const checked = selectedIds.includes(item.id)
        return <label key={item.id} className="grid cursor-pointer grid-cols-[44px_1.2fr_1fr_1fr] gap-3 border-b px-3 py-3 text-sm last:border-b-0 hover:bg-slate-50">
          <input type="checkbox" checked={checked} onChange={() => toggle(item)} />
          <span><strong className="block">{label(item)}</strong><span className="text-xs text-muted-foreground">{[item.brand, item.model, item.vehicle_category || item.vehicle_type].filter(Boolean).join(" · ")}</span></span>
          <span><span className="block">{item.owner_name || "—"}</span><span className="text-xs text-muted-foreground">{item.provider_name || "No provider"}</span></span>
          <span className="font-mono text-xs">{item.imei || "—"}</span>
        </label>
      }) : <div className="p-6 text-center text-sm text-muted-foreground">No vehicles found.</div>}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>{result ? `${result.total.toLocaleString()} vehicles · Page ${result.page} of ${result.total_pages}` : ""}</span>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={loading || !result || result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft /> Previous</Button>
        <Button type="button" size="sm" variant="outline" disabled={loading || !result || result.page >= result.total_pages} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight /></Button>
      </div>
    </div>
  </div>
}
