"use client"

import { Download, Loader2 } from "lucide-react"
import { useState } from "react"

import { GoMaxImportDialog, type GoMaxImportPreview } from "@/components/provider/gomax-import-dialog"
import { ProviderOwnerCombobox } from "@/components/provider/provider-owner-combobox"
import { Button } from "@/components/ui/button"
import type { ProviderVehicleOwnerOption } from "@/components/provider/provider-vehicle-registration-form"

type ImportResult = { imported: number; skipped: number; message?: string }

export function GoMaxVehicleImportV2({ owners }: { owners: ProviderVehicleOwnerOption[] }) {
  const [ownerId, setOwnerId] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [preview, setPreview] = useState<GoMaxImportPreview | null>(null)

  async function reviewImport() {
    if (!ownerId) return
    setLoadingPreview(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/provider/vehicles/gomax-import-preview?owner_id=${encodeURIComponent(ownerId)}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || "Unable to load Go Max vehicles.")
      setPreview(result as GoMaxImportPreview)
      setDialogOpen(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Go Max vehicles.")
    } finally {
      setLoadingPreview(false)
    }
  }

  async function executeImport(projectIds?: string[]) {
    if (!ownerId) return
    setImporting(true)
    setMessage(null)
    try {
      const payload: { owner_id: string; project_ids?: string[] } = { owner_id: ownerId }
      if (projectIds) payload.project_ids = projectIds
      const response = await fetch("/api/provider/vehicles/gomax-selection/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await response.json() as ImportResult
      if (!response.ok) throw new Error(result.message || "Import failed")
      setDialogOpen(false)
      setMessage(`${result.imported} vehicle imported; ${result.skipped} already existed or skipped.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed")
    } finally {
      setImporting(false)
    }
  }

  return <>
    <div className="rounded-2xl border bg-slate-50 p-5">
      <p className="font-semibold">Import vehicles from Go Max</p>
      <p className="mt-1 text-sm text-muted-foreground">Search and select an owner. You will review the Go Max vehicle count before anything is imported.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <div className="min-w-72 flex-1">
          <ProviderOwnerCombobox
            owners={owners}
            value={ownerId}
            onValueChange={(value) => { setOwnerId(value); setPreview(null); setMessage(null) }}
            placeholder="Search and select owner"
          />
        </div>
        <Button type="button" onClick={() => void reviewImport()} disabled={!ownerId || loadingPreview}>
          {loadingPreview ? <Loader2 className="animate-spin" /> : <Download />} Review vehicles
        </Button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </div>

    <GoMaxImportDialog
      open={dialogOpen}
      preview={preview}
      importing={importing}
      onOpenChange={setDialogOpen}
      onImportAll={() => void executeImport()}
      onImportSelected={(projectIds) => void executeImport(projectIds)}
    />
  </>
}
