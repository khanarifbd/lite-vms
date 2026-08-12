"use client"

import { AlertCircle, Loader2, Save, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { VehicleDetails, VehicleUpdatePayload } from "@/features/vehicles/types"
import type { VehicleIdentityAvailability } from "@/features/provider/vehicle-registration-types"

type VehicleEditFormProps = {
  vehicle: VehicleDetails
  apiBase: string
  detailsBase: string
  mode: "provider" | "owner"
}

type SaveMode = "save" | "resubmit"

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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SelectField({ name, options, value, placeholder, required = false }: {
  name: string
  options: RegistrationOption[]
  value: string | null
  placeholder: string
  required?: boolean
}) {
  const hasCurrentValue = Boolean(value && !options.some((option) => option.value === value))
  return (
    <select name={name} defaultValue={value || ""} required={required} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <option value="">{placeholder}</option>
      {hasCurrentValue ? <option value={value || ""}>{value}</option> : null}
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
  const body = (await response.json().catch(() => null)) as { message?: string } | null
  return body?.message || fallback
}

export function VehicleEditForm({ vehicle, apiBase, detailsBase, mode }: VehicleEditFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pendingMode, setPendingMode] = useState<SaveMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<VehicleRegistrationOptions>(emptyOptions)
  const isGoMaxImported = vehicle.registration_number.startsWith("GOMAX-")

  useEffect(() => {
    let active = true
    void fetch("/api/vehicle-registration-options")
      .then((response) => response.ok ? response.json() as Promise<VehicleRegistrationOptions> : Promise.reject(new Error("Unable to load vehicle options.")))
      .then((result) => { if (active) setOptions(result) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  function buildPayload(data: FormData): VehicleUpdatePayload {
    const registrationNumber = isGoMaxImported
      ? readText(data, "official_registration_number") || vehicle.registration_number
      : readText(data, "registration_number")
    const registeredOwnerName = readText(data, "registered_owner_name")
    const chassisNumber = readText(data, "chassis_number")
    const vehicleType = readText(data, "vehicle_type")
    if (!registrationNumber || !registeredOwnerName || !chassisNumber || !vehicleType) {
      throw new Error("Registered owner name, registration number, chassis number, and vehicle type are required.")
    }

    return {
      registration_number: registrationNumber,
      registration_number_display: isGoMaxImported
        ? readText(data, "vehicle_display_name")
        : readText(data, "registration_number_display"),
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
    }
  }

  async function checkIdentity(payload: VehicleUpdatePayload) {
    const params = new URLSearchParams({
      registration_number: payload.registration_number || "",
      chassis_number: payload.chassis_number || "",
      exclude_vehicle_id: vehicle.id,
    })
    if (payload.engine_number) params.set("engine_number", payload.engine_number)

    const response = await fetch(`${apiBase}/identity-check?${params.toString()}`)
    if (!response.ok) {
      throw new Error(await responseMessage(response, "Unable to validate vehicle identity."))
    }
    const result = (await response.json()) as VehicleIdentityAvailability
    if (result.available) return

    const conflicts: string[] = []
    if (!result.registration_number_available) conflicts.push("registration number")
    if (!result.chassis_number_available) conflicts.push("chassis number")
    if (!result.engine_number_available) conflicts.push("engine number")
    throw new Error(`Another vehicle already uses this ${conflicts.join(", ")}.`)
  }

  async function saveVehicle(saveMode: SaveMode) {
    if (!formRef.current) return
    setPendingMode(saveMode)
    setError(null)
    try {
      const payload = buildPayload(new FormData(formRef.current))
      await checkIdentity(payload)

      const updateResponse = await fetch(`${apiBase}/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!updateResponse.ok) {
        throw new Error(await responseMessage(updateResponse, "Unable to save vehicle changes."))
      }

      if (saveMode === "resubmit") {
        const submitResponse = await fetch(`${apiBase}/${vehicle.id}/submit`, { method: "POST" })
        if (!submitResponse.ok) {
          throw new Error(
            await responseMessage(submitResponse, "Changes were saved, but resubmission failed.")
          )
        }
        router.push(`${detailsBase}/${vehicle.id}?submitted=1`)
      } else {
        router.push(`${detailsBase}/${vehicle.id}?updated=1`)
      }
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save vehicle changes.")
      window.scrollTo({ top: 0, behavior: "smooth" })
    } finally {
      setPendingMode(null)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveVehicle("save")
  }

  const correctionMode = vehicle.verification_status === "changes_requested"
  const directUpdateMode = mode === "provider" && vehicle.verification_status === "verified"

  return (
    <div className="space-y-5">
      {correctionMode ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertCircle />
          <AlertTitle>Bangladesh Police requested changes</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{vehicle.review_notes || "Review the registration and correct the requested fields."}</p>
            <p className="text-xs">
              Save the correction first or use Save and resubmit to return the registration to the police review queue.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Vehicle changes could not be saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Vehicle owner</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="font-semibold">{vehicle.owner.owner_name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {vehicle.owner.owner_code || "Owner code pending"}
                {vehicle.owner.phone ? ` · ${vehicle.owner.phone}` : ""}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {mode === "provider"
                  ? "The linked owner cannot be changed during correction. Register a separate vehicle if the ownership record is incorrect."
                  : "This registration remains attached to your verified owner profile. Ownership cannot be changed from the correction form."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Identity and basic information</CardTitle></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field
              label="Registered owner name"
              hint="Enter the owner name exactly as shown on the vehicle registration certificate. This name will appear on the vehicle certificate."
            >
              <Input
                name="registered_owner_name"
                required
                maxLength={180}
                defaultValue={vehicle.registered_owner_name || vehicle.owner.owner_name}
              />
            </Field>
            {isGoMaxImported ? (
              <>
                <Field
                  label="Vehicle display name"
                  hint="Imported from GoMax. You can update this name at any time."
                >
                  <Input
                    name="vehicle_display_name"
                    required
                    maxLength={80}
                    defaultValue={vehicle.registration_number_display || vehicle.registration_number}
                  />
                </Field>
                <Field
                  label="Official registration number"
                  hint="Add this later when available. Saving it will replace the temporary GoMax ID."
                >
                  <Input name="official_registration_number" maxLength={80} placeholder="Add registration number later" />
                </Field>
              </>
            ) : (
              <>
                <Field label="Registration number" hint="Checked against the global vehicle registry.">
                  <Input name="registration_number" required maxLength={80} defaultValue={vehicle.registration_number} />
                </Field>
                <Field label="Display registration number">
                  <Input name="registration_number_display" maxLength={80} defaultValue={vehicle.registration_number_display || ""} />
                </Field>
              </>
            )}
            <Field label="Chassis number" hint="Checked against the global vehicle registry.">
              <Input name="chassis_number" required maxLength={120} defaultValue={vehicle.chassis_number} />
            </Field>
            <Field label="Engine number">
              <Input name="engine_number" maxLength={120} defaultValue={vehicle.engine_number || ""} />
            </Field>
            <Field label="Vehicle type" hint="Managed by Super Admin in System Settings.">
              <SelectField name="vehicle_type" required options={options.vehicle_types} value={vehicle.vehicle_type} placeholder="Select vehicle type" />
            </Field>
            <Field label="Vehicle category">
              <SelectField name="vehicle_category" options={options.vehicle_categories} value={vehicle.vehicle_category} placeholder="Select vehicle category" />
            </Field>
            <Field label="Usage type">
              <SelectField name="usage_type" options={options.usage_types} value={vehicle.usage_type} placeholder="Select usage type" />
            </Field>
            <Field label="Body type">
              <SelectField name="body_type" options={options.body_types} value={vehicle.body_type} placeholder="Select body type" />
            </Field>
            <Field label="Fuel type">
              <SelectField name="fuel_type" options={options.fuel_types} value={vehicle.fuel_type} placeholder="Select fuel type" />
            </Field>
            <Field label="Brand"><Input name="brand" maxLength={100} defaultValue={vehicle.brand || ""} /></Field>
            <Field label="Model"><Input name="model" maxLength={100} defaultValue={vehicle.model || ""} /></Field>
            <Field label="Manufacturing year">
              <Input name="manufacturing_year" type="number" min={1900} max={2200} defaultValue={vehicle.manufacturing_year ?? ""} />
            </Field>
            <Field label="Color"><SelectField name="color" options={options.colors} value={vehicle.color} placeholder="Select vehicle color" /></Field>
            <Field label="Registration date"><Input name="registration_date" type="date" defaultValue={vehicle.registration_date || ""} /></Field>
            <Field label="Registration authority">
              <Input name="registration_authority" maxLength={120} defaultValue={vehicle.registration_authority || ""} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Technical information</CardTitle></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Engine capacity (cc)"><Input name="engine_capacity_cc" type="number" min={1} max={100000} defaultValue={vehicle.engine_capacity_cc ?? ""} /></Field>
            <Field label="Axle count"><Input name="axle_count" type="number" min={1} max={30} defaultValue={vehicle.axle_count ?? ""} /></Field>
            <Field label="Gross vehicle weight (kg)"><Input name="gross_vehicle_weight_kg" type="number" min={0} step="0.01" defaultValue={vehicle.gross_vehicle_weight_kg ?? ""} /></Field>
            <Field label="Seating capacity"><Input name="seating_capacity" type="number" min={1} max={500} defaultValue={vehicle.seating_capacity ?? ""} /></Field>
            <Field label="Load capacity (kg)"><Input name="load_capacity_kg" type="number" min={0} step="0.01" defaultValue={vehicle.load_capacity_kg ?? ""} /></Field>
            <Field label="Default speed limit (km/h)">
              <Input name="default_speed_limit_kph" type="number" min={1} max={250} step="0.1" required defaultValue={vehicle.default_speed_limit_kph} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Compliance and route permit</CardTitle></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Fitness expiry date"><Input name="fitness_expiry_date" type="date" defaultValue={vehicle.fitness_expiry_date || ""} /></Field>
            <Field label="Tax token expiry date"><Input name="tax_token_expiry_date" type="date" defaultValue={vehicle.tax_token_expiry_date || ""} /></Field>
            <Field label="Insurance expiry date"><Input name="insurance_expiry_date" type="date" defaultValue={vehicle.insurance_expiry_date || ""} /></Field>
            <Field label="Route permit number"><Input name="route_permit_number" maxLength={120} defaultValue={vehicle.route_permit_number || ""} /></Field>
            <Field label="Route permit expiry date"><Input name="route_permit_expiry_date" type="date" defaultValue={vehicle.route_permit_expiry_date || ""} /></Field>
            <div className="md:col-span-2 xl:col-span-3">
              <Field label="Route permit area"><Textarea name="route_permit_area" rows={3} maxLength={1000} defaultValue={vehicle.route_permit_area || ""} /></Field>
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <Field label={mode === "provider" ? "Provider notes" : "Owner notes"}>
                <Textarea name="notes" rows={4} maxLength={2000} defaultValue={vehicle.notes || ""} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            {directUpdateMode
              ? "Saving updates this verified vehicle directly and keeps its verified status. The change is recorded in the audit trail."
              : "Saving keeps the current draft or change-request status. Save and resubmit sends the corrected registration back to Bangladesh Police while preserving the previous decision in the audit trail."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={pendingMode !== null}>
              {pendingMode === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save changes
            </Button>
            {!directUpdateMode ? <Button type="button" disabled={pendingMode !== null} onClick={() => void saveVehicle("resubmit")} className="bg-emerald-800 text-white hover:bg-emerald-900">
              {pendingMode === "resubmit" ? <Loader2 className="animate-spin" /> : <Send />}
              {correctionMode ? "Save corrections & resubmit" : "Save & submit for review"}
            </Button> : null}
          </div>
        </div>
      </form>
    </div>
  )
}
