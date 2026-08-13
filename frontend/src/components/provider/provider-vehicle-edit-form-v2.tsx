"use client"

import { AlertCircle, Loader2, Save, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, useEffect, useRef, useState } from "react"

import { ProviderVehicleEditCompliance } from "@/components/provider/provider-vehicle-edit-compliance"
import { ProviderVehicleEditIdentity } from "@/components/provider/provider-vehicle-edit-identity"
import { ProviderVehicleEditTech } from "@/components/provider/provider-vehicle-edit-tech"
import { buildProviderVehicleUpdate } from "@/components/provider/provider-vehicle-edit-utils"
import { checkProviderVehicleIdentity, responseMessage } from "@/components/provider/provider-vehicle-form-utils"
import { emptyVehicleFormOptions, type VehicleFormOptions } from "@/components/provider/vehicle-form-fields"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { VehicleDetails } from "@/features/vehicles/types"

type SaveMode = "save" | "resubmit"

export function ProviderVehicleEditFormV2({ vehicle }: { vehicle: VehicleDetails }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pendingMode, setPendingMode] = useState<SaveMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<VehicleFormOptions>(emptyVehicleFormOptions)
  const apiBase = "/api/provider/vehicles"
  const detailsBase = "/provider/vehicles"
  const correctionMode = vehicle.verification_status === "changes_requested"
  const directUpdateMode = vehicle.verification_status === "verified"

  useEffect(() => {
    let active = true
    void fetch("/api/vehicle-registration-options")
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response, "Unable to load vehicle options."))
        return response.json() as Promise<VehicleFormOptions>
      })
      .then((result) => { if (active) setOptions(result) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  async function saveVehicle(mode: SaveMode) {
    if (!formRef.current) return
    setPendingMode(mode)
    setError(null)
    try {
      const payload = buildProviderVehicleUpdate(new FormData(formRef.current), vehicle)
      await checkProviderVehicleIdentity(apiBase, payload, vehicle.id)
      const response = await fetch(`${apiBase}/${vehicle.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to save vehicle changes."))
      if (mode === "resubmit") {
        const submit = await fetch(`${apiBase}/${vehicle.id}/submit`, { method: "POST" })
        if (!submit.ok) throw new Error(await responseMessage(submit, "Changes were saved, but resubmission failed."))
        router.push(`${detailsBase}/${vehicle.id}?submitted=1`)
      } else {
        router.push(`${detailsBase}/${vehicle.id}?updated=1`)
      }
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save vehicle changes.")
      window.scrollTo({ top: 0, behavior: "smooth" })
    } finally { setPendingMode(null) }
  }

  return <div className="space-y-5">
    {correctionMode ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle /><AlertTitle>Bangladesh Police requested changes</AlertTitle><AlertDescription className="space-y-2"><p>{vehicle.review_notes || "Review the registration and correct the requested fields."}</p><p className="text-xs">Save the correction first or use Save and resubmit to return the registration to the police review queue.</p></AlertDescription></Alert> : null}
    {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Vehicle changes could not be saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <form ref={formRef} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void saveVehicle("save") }} className="space-y-5">
      <Card><CardHeader><CardTitle>Vehicle owner</CardTitle></CardHeader><CardContent><div className="rounded-2xl border bg-slate-50 p-4"><p className="font-semibold">{vehicle.owner.owner_name}</p><p className="mt-1 text-sm text-muted-foreground">{vehicle.owner.owner_code || "Owner code pending"}{vehicle.owner.phone ? ` · ${vehicle.owner.phone}` : ""}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">The linked owner cannot be changed during correction. Register a separate vehicle if the ownership record is incorrect.</p></div></CardContent></Card>
      <ProviderVehicleEditIdentity vehicle={vehicle} options={options} />
      <ProviderVehicleEditTech v={vehicle} />
      <ProviderVehicleEditCompliance v={vehicle} />
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl text-sm leading-6 text-muted-foreground">{directUpdateMode ? "Saving updates this verified vehicle directly and keeps its verified status. The change is recorded in the audit trail." : "Saving keeps the current draft or change-request status. Save and resubmit sends the corrected registration back to Bangladesh Police while preserving the previous decision in the audit trail."}</p><div className="flex flex-wrap gap-2"><Button type="submit" variant="outline" disabled={pendingMode !== null}>{pendingMode === "save" ? <Loader2 className="animate-spin" /> : <Save />}Save changes</Button>{!directUpdateMode ? <Button type="button" disabled={pendingMode !== null} onClick={() => void saveVehicle("resubmit")} className="bg-emerald-800 text-white hover:bg-emerald-900">{pendingMode === "resubmit" ? <Loader2 className="animate-spin" /> : <Send />}{correctionMode ? "Save corrections & resubmit" : "Save & submit for review"}</Button> : null}</div></div>
    </form>
  </div>
}
