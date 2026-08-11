"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type ProviderVehicleOwnerOption } from "@/components/provider/provider-vehicle-registration-form"

export function GoMaxVehicleImport({ owners }: { owners: ProviderVehicleOwnerOption[] }) {
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  async function runImport() {
    if (!ownerId) return
    setLoading(true); setMessage(null)
    try {
      const response = await fetch("/api/provider/vehicles/gomax-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner_id: ownerId }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || "Import failed")
      setMessage(`${result.imported} vehicle imported; ${result.skipped} already existed or skipped.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed") }
    finally { setLoading(false) }
  }
  return <div className="rounded-2xl border bg-slate-50 p-5"><p className="font-semibold">Import vehicles from Go Max</p><p className="mt-1 text-sm text-muted-foreground">Select an owner. Their username is used to retrieve the Go Max customer ID and all device projects are saved as draft vehicles.</p><div className="mt-4 flex flex-wrap gap-3"><select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="h-10 min-w-72 rounded-md border bg-background px-3 text-sm"><option value="">Select owner</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.owner_name} · {owner.owner_code}</option>)}</select><Button type="button" onClick={() => void runImport()} disabled={!ownerId || loading}>{loading ? <Loader2 className="animate-spin" /> : <Download />} Import all vehicles</Button></div>{message ? <p className="mt-3 text-sm">{message}</p> : null}</div>
}
