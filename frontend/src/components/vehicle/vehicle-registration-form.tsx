"use client"

import { AlertCircle, CheckCircle2, FileClock, Loader2, Send, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type {
  ProviderVehicleRegistrationPayload,
  ProviderVehicleRegistrationResult,
  VehicleIdentityAvailability,
} from "@/features/provider/vehicle-registration-types"

type RegistrationOption = { value: string; label: string }
type VehicleRegistrationOptions = {
  vehicle_types: RegistrationOption[]
  vehicle_categories: RegistrationOption[]
  usage_types: RegistrationOption[]
  body_types: RegistrationOption[]
  fuel_types: RegistrationOption[]
  colors: RegistrationOption[]
}

const emptyOptions: VehicleRegistrationOptions = {
  vehicle_types: [],
  vehicle_categories: [],
  usage_types: [],
  body_types: [],
  fuel_types: [],
  colors: [],
}

export type VehicleRegistrationOwnerOption = {
  id: string
  owner_name: string
  owner_code: string | null
  identity_reference: string
  phone: string | null
}

type VehicleRegistrationFormProps = {
  mode: "provider" | "owner"
  apiBase: string
  registryHref: string
  owners?: VehicleRegistrationOwnerOption[]
  fixedOwner?: VehicleRegistrationOwnerOption | null
}

type SubmissionMode = "draft" | "submit"

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}{hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}</div>
}

function SelectField({ name, options, placeholder, required = false, disabled = false }: {
  name: string
  options: RegistrationOption[]
  placeholder: string
  required?: boolean
  disabled?: boolean
}) {
  return (
    <select
      name={name}
      required={required}
      disabled={disabled}
      defaultValue=""
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

function readText(data: FormData, key: string) {
  const value = String(data.get(key) || "").trim()
  return value || null
}

function readNumber(data: FormData, key: string) {
  const value = readText(data, key)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function responseMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { message?: string; detail?: string | { message?: string } } | null
  if (body?.message) return body.message
  if (typeof body?.detail === "string") return body.detail
  if (body?.detail && typeof body.detail === "object" && body.detail.message) return body.detail.message
  return fallback
}

export function VehicleRegistrationForm({ mode, apiBase, registryHref, owners = [], fixedOwner = null }: VehicleRegistrationFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pendingMode, setPendingMode] = useState<SubmissionMode | "submit-draft" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProviderVehicleRegistrationResult | null>(null)
  const [options, setOptions] = useState<VehicleRegistrationOptions>(emptyOptions)
  const [optionsLoading, setOptionsLoading] = useState(true)

  const ownerAvailable = mode === "owner" ? Boolean(fixedOwner) : owners.length > 0

  useEffect(() => {
    let active = true
    void fetch("/api/vehicle-registration-options")
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response, "Unable to load vehicle options."))
        return response.json() as Promise<VehicleRegistrationOptions>
      })
      .then((result) => { if (active) setOptions(result) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load vehicle options.") })
      .finally(() => { if (active) setOptionsLoading(false) })
    return () => { active = false }
  }, [])

  async function checkIdentity(payload: ProviderVehicleRegistrationPayload) {
    const params = new URLSearchParams({ registration_number: payload.registration_number, chassis_number: payload.chassis_number })
    if (payload.engine_number) params.set("engine_number", payload.engine_number)
    const response = await fetch(`${apiBase}/identity-check?${params.toString()}`)
    if (!response.ok) throw new Error(await responseMessage(response, "Unable to validate vehicle identity."))
    const result = (await response.json()) as VehicleIdentityAvailability
    if (result.available) return
    const conflicts: string[] = []
    if (!result.registration_number_available) conflicts.push("registration number")
    if (!result.chassis_number_available) conflicts.push("chassis number")
    if (!result.engine_number_available) conflicts.push("engine number")
    throw new Error(`A vehicle already exists with this ${conflicts.join(", ")}.`)
  }

  function buildPayload(data: FormData, submitForReview: boolean): ProviderVehicleRegistrationPayload {
    const ownerId = readText(data, "owner_id")
    const registrationNumber = readText(data, "registration_number")
    const registeredOwnerName = readText(data, "registered_owner_name")
    const chassisNumber = readText(data, "chassis_number")
    const vehicleType = readText(data, "vehicle_type")
    if (!ownerId || !registrationNumber || !registeredOwnerName || !chassisNumber || !vehicleType) throw new Error("Owner, registered owner name, registration number, chassis number, and vehicle type are required.")
    return {
      owner_id: ownerId,
      registration_number: registrationNumber,
      registration_number_display: readText(data, "registration_number_display"),
      registered_owner_name: registeredOwnerName,
      chassis_number: chassisNumber,
      engine_number: readText(data, "engine_number"),
      vehicle_type: vehicleType,
      vehicle_category: readText(data, "vehicle_category"),
      usage_type: readText(data, "usage_type"),
      body_type: readText(data, "body_type"),
      fuel_type: readText(data, "fuel_type"),
      brand: readText(data, "brand"),
      model: readText(data, "model"),
      manufacturing_year: readNumber(data, "manufacturing_year"),
      registration_date: readText(data, "registration_date"),
      registration_authority: readText(data, "registration_authority"),
      engine_capacity_cc: readNumber(data, "engine_capacity_cc"),
      axle_count: readNumber(data, "axle_count"),
      gross_vehicle_weight_kg: readNumber(data, "gross_vehicle_weight_kg"),
      color: readText(data, "color"),
      seating_capacity: readNumber(data, "seating_capacity"),
      load_capacity_kg: readNumber(data, "load_capacity_kg"),
      route_permit_number: readText(data, "route_permit_number"),
      route_permit_area: readText(data, "route_permit_area"),
      route_permit_expiry_date: readText(data, "route_permit_expiry_date"),
      fitness_expiry_date: readText(data, "fitness_expiry_date"),
      tax_token_expiry_date: readText(data, "tax_token_expiry_date"),
      insurance_expiry_date: readText(data, "insurance_expiry_date"),
      notes: readText(data, "notes"),
      default_speed_limit_kph: readNumber(data, "default_speed_limit_kph") || 80,
      submit_for_review: submitForReview,
    }
  }

  async function registerVehicle(submissionMode: SubmissionMode) {
    if (!formRef.current) return
    setPendingMode(submissionMode)
    setError(null)
    try {
      const payload = buildPayload(new FormData(formRef.current), submissionMode === "submit")
      await checkIdentity(payload)
      const response = await fetch(apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to register the vehicle."))
      const result = (await response.json()) as ProviderVehicleRegistrationResult
      if (submissionMode === "draft") {
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void registerVehicle("submit") }
  const controlsDisabled = draft !== null || optionsLoading

  return (
    <div className="space-y-5">
      {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Registration could not be completed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {draft ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><FileClock /><AlertTitle>Vehicle draft saved</AlertTitle><AlertDescription className="space-y-3"><p>{draft.registration_number_display || draft.registration_number} is saved as a draft and has not entered the Bangladesh Police review queue.</p><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void submitDraft()} disabled={pendingMode !== null} className="bg-emerald-800 text-white hover:bg-emerald-900">{pendingMode === "submit-draft" ? <Loader2 className="animate-spin" /> : <Send />}Submit draft for review</Button><Button type="button" variant="outline" onClick={() => router.push(registryHref)}>View vehicle registry</Button></div></AlertDescription></Alert> : null}
      {!ownerAvailable ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle /><AlertTitle>No eligible vehicle owner</AlertTitle><AlertDescription>{mode === "provider" ? "Register or connect a vehicle owner first. The owner link must be active and the owner must be approved." : "Complete the owner profile and Bangladesh Police verification before registering a vehicle."}</AlertDescription></Alert> : null}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <Card><CardHeader><CardTitle>1. Vehicle owner</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">
          {mode === "provider" ? <Field label="Vehicle owner"><select name="owner_id" required disabled={!owners.length || draft !== null} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none" defaultValue=""><option value="" disabled>Select an approved active-linked owner</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.owner_name} · {owner.owner_code || owner.identity_reference}</option>)}</select></Field> : fixedOwner ? <><input type="hidden" name="owner_id" value={fixedOwner.id} /><div className="rounded-2xl border bg-slate-50 p-4"><p className="font-semibold">{fixedOwner.owner_name}</p><p className="mt-1 text-sm text-muted-foreground">{fixedOwner.owner_code || fixedOwner.identity_reference}</p><p className="mt-1 text-sm text-muted-foreground">{fixedOwner.phone || "No phone number"}</p></div></> : null}
          <div className="rounded-2xl border bg-slate-50 p-4 text-sm leading-6 text-muted-foreground">{mode === "provider" ? "Only approved owners with an active provider connection are available here." : "This vehicle will be registered under your verified national owner profile."}</div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>2. Vehicle identity and basic information</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Registered owner name" hint="Enter the owner name exactly as shown on the vehicle registration certificate. This name will appear on the vehicle certificate."><Input name="registered_owner_name" required maxLength={180} defaultValue={mode === "owner" ? fixedOwner?.owner_name : ""} disabled={draft !== null} /></Field>
          <Field label="Registration number" hint="Bangladesh registration format; checked globally for duplicates."><Input name="registration_number" required maxLength={80} disabled={draft !== null} /></Field>
          <Field label="Display registration number"><Input name="registration_number_display" maxLength={80} disabled={draft !== null} /></Field>
          <Field label="Chassis number" hint="Normalized and checked globally for duplicates."><Input name="chassis_number" required maxLength={120} disabled={draft !== null} /></Field>
          <Field label="Engine number"><Input name="engine_number" maxLength={120} disabled={draft !== null} /></Field>
          <Field label="Vehicle type" hint="Managed by Super Admin in System Settings."><SelectField name="vehicle_type" required options={options.vehicle_types} placeholder={optionsLoading ? "Loading vehicle types..." : "Select vehicle type"} disabled={controlsDisabled} /></Field>
          <Field label="Vehicle category"><SelectField name="vehicle_category" options={options.vehicle_categories} placeholder="Select vehicle category" disabled={controlsDisabled} /></Field>
          <Field label="Usage type"><SelectField name="usage_type" options={options.usage_types} placeholder="Select usage type" disabled={controlsDisabled} /></Field>
          <Field label="Body type"><SelectField name="body_type" options={options.body_types} placeholder="Select body type" disabled={controlsDisabled} /></Field>
          <Field label="Fuel type"><SelectField name="fuel_type" options={options.fuel_types} placeholder="Select fuel type" disabled={controlsDisabled} /></Field>
          <Field label="Brand"><Input name="brand" maxLength={100} disabled={draft !== null} /></Field>
          <Field label="Model"><Input name="model" maxLength={100} disabled={draft !== null} /></Field>
          <Field label="Manufacturing year"><Input name="manufacturing_year" type="number" min={1900} max={2200} disabled={draft !== null} /></Field>
          <Field label="Color"><SelectField name="color" options={options.colors} placeholder="Select vehicle color" disabled={controlsDisabled} /></Field>
          <Field label="Registration date"><Input name="registration_date" type="date" disabled={draft !== null} /></Field>
          <Field label="Registration authority"><Input name="registration_authority" maxLength={120} placeholder="BRTA office" disabled={draft !== null} /></Field>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>3. Technical information</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Engine capacity (cc)"><Input name="engine_capacity_cc" type="number" min={1} max={100000} disabled={draft !== null} /></Field>
          <Field label="Axle count"><Input name="axle_count" type="number" min={1} max={30} disabled={draft !== null} /></Field>
          <Field label="Gross vehicle weight (kg)"><Input name="gross_vehicle_weight_kg" type="number" min={0} step="0.01" disabled={draft !== null} /></Field>
          <Field label="Seating capacity"><Input name="seating_capacity" type="number" min={1} max={500} disabled={draft !== null} /></Field>
          <Field label="Load capacity (kg)"><Input name="load_capacity_kg" type="number" min={0} step="0.01" disabled={draft !== null} /></Field>
          <Field label="Default speed limit (km/h)"><Input name="default_speed_limit_kph" type="number" min={1} max={250} defaultValue={80} disabled={draft !== null} /></Field>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>4. Registration and compliance references</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Fitness expiry"><Input name="fitness_expiry_date" type="date" disabled={draft !== null} /></Field>
          <Field label="Tax token expiry"><Input name="tax_token_expiry_date" type="date" disabled={draft !== null} /></Field>
          <Field label="Insurance expiry"><Input name="insurance_expiry_date" type="date" disabled={draft !== null} /></Field>
          <Field label="Route permit number"><Input name="route_permit_number" maxLength={120} disabled={draft !== null} /></Field>
          <Field label="Route permit expiry"><Input name="route_permit_expiry_date" type="date" disabled={draft !== null} /></Field>
          <div className="md:col-span-2 xl:col-span-3"><Field label="Route permit area"><Textarea name="route_permit_area" maxLength={1000} disabled={draft !== null} /></Field></div>
          <div className="md:col-span-2 xl:col-span-3"><Field label="Notes"><Textarea name="notes" maxLength={2000} disabled={draft !== null} /></Field></div>
        </CardContent></Card>

        {!draft ? <div className="flex flex-col-reverse justify-end gap-3 rounded-2xl border bg-white p-4 sm:flex-row"><Button type="button" variant="outline" disabled={!ownerAvailable || pendingMode !== null || optionsLoading} onClick={() => void registerVehicle("draft")}>{pendingMode === "draft" ? <Loader2 className="animate-spin" /> : <Save />}Save draft</Button><Button type="submit" disabled={!ownerAvailable || pendingMode !== null || optionsLoading} className="bg-emerald-800 text-white hover:bg-emerald-900">{pendingMode === "submit" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Submit for police review</Button></div> : null}
      </form>
    </div>
  )
}
