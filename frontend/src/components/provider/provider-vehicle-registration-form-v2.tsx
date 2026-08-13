"use client"

import { AlertCircle, CheckCircle2, FileClock, Loader2, Save, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, useEffect, useRef, useState } from "react"

import { ProviderVehicleRegistrationCompliance } from "@/components/provider/provider-vehicle-registration-compliance"
import { ProviderVehicleRegistrationIdentity } from "@/components/provider/provider-vehicle-registration-identity"
import { ProviderVehicleRegistrationTechnical } from "@/components/provider/provider-vehicle-registration-technical"
import { buildProviderRegistrationPayload, checkProviderVehicleIdentity, responseMessage } from "@/components/provider/provider-vehicle-form-utils"
import { emptyVehicleFormOptions, type VehicleFormOptions } from "@/components/provider/vehicle-form-fields"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { VehicleRegistrationOwnerOption } from "@/components/vehicle/vehicle-registration-form"
import type { ProviderVehicleRegistrationResult } from "@/features/provider/vehicle-registration-types"

type SubmissionMode = "draft" | "submit"

export function ProviderVehicleRegistrationFormV2({ owners }: { owners: VehicleRegistrationOwnerOption[] }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pendingMode, setPendingMode] = useState<SubmissionMode | "submit-draft" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProviderVehicleRegistrationResult | null>(null)
  const [options, setOptions] = useState<VehicleFormOptions>(emptyVehicleFormOptions)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const apiBase = "/api/provider/vehicles"
  const registryHref = "/provider/vehicles"

  useEffect(() => {
    let active = true
    void fetch("/api/vehicle-registration-options")
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response, "Unable to load vehicle options."))
        return response.json() as Promise<VehicleFormOptions>
      })
      .then((result) => { if (active) setOptions(result) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load vehicle options.") })
      .finally(() => { if (active) setOptionsLoading(false) })
    return () => { active = false }
  }, [])

  async function registerVehicle(mode: SubmissionMode) {
    if (!formRef.current) return
    setPendingMode(mode)
    setError(null)
    try {
      const payload = buildProviderRegistrationPayload(new FormData(formRef.current), mode === "submit")
      await checkProviderVehicleIdentity(apiBase, payload)
      const response = await fetch(apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to register the vehicle."))
      const result = (await response.json()) as ProviderVehicleRegistrationResult
      if (mode === "draft") {
        setDraft(result)
        window.scrollTo({ top: 0, behavior: "smooth" })
      } else {
        router.push(`${registryHref}?registration=submitted`)
        router.refresh()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to register the vehicle.")
      window.scrollTo({ top: 0, behavior: "smooth" })
    } finally { setPendingMode(null) }
  }

  async function submitDraft() {
    if (!draft) return
    setPendingMode("submit-draft")
    setError(null)
    try {
      const response = await fetch(`${apiBase}/${draft.id}/submit`, { method: "POST" })
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to submit the vehicle draft."))
      router.push(`${registryHref}?registration=submitted`)
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to submit the vehicle draft.") }
    finally { setPendingMode(null) }
  }

  return <div className="space-y-5">
    {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Registration could not be completed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {draft ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><FileClock /><AlertTitle>Vehicle draft saved</AlertTitle><AlertDescription className="space-y-3"><p>{draft.registration_number_display || draft.registration_number} is saved as a draft and has not entered the Bangladesh Police review queue.</p><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void submitDraft()} disabled={pendingMode !== null} className="bg-emerald-800 text-white hover:bg-emerald-900">{pendingMode === "submit-draft" ? <Loader2 className="animate-spin" /> : <Send />}Submit draft for review</Button><Button type="button" variant="outline" onClick={() => router.push(registryHref)}>View vehicle registry</Button></div></AlertDescription></Alert> : null}
    {!owners.length ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle /><AlertTitle>No eligible vehicle owner</AlertTitle><AlertDescription>Register or connect a vehicle owner first. The owner link must be active and the owner must be approved.</AlertDescription></Alert> : null}
    <form ref={formRef} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void registerVehicle("submit") }} className="space-y-5">
      <ProviderVehicleRegistrationIdentity owners={owners} options={options} disabled={draft !== null} optionsLoading={optionsLoading} />
      <ProviderVehicleRegistrationTechnical disabled={draft !== null} />
      <ProviderVehicleRegistrationCompliance disabled={draft !== null} />
      {!draft ? <div className="flex flex-col-reverse justify-end gap-3 rounded-2xl border bg-white p-4 sm:flex-row"><Button type="button" variant="outline" disabled={!owners.length || pendingMode !== null || optionsLoading} onClick={() => void registerVehicle("draft")}>{pendingMode === "draft" ? <Loader2 className="animate-spin" /> : <Save />}Save draft</Button><Button type="submit" disabled={!owners.length || pendingMode !== null || optionsLoading} className="bg-emerald-800 text-white hover:bg-emerald-900">{pendingMode === "submit" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Submit for police review</Button></div> : null}
    </form>
  </div>
}
