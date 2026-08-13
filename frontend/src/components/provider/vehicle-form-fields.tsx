import type { ReactNode } from "react"

import { DdMmYyyyInput } from "@/components/ui/date-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Option = { value: string; label: string }

export type VehicleFormOptions = {
  vehicle_types: Option[]
  vehicle_categories: Option[]
  usage_types: Option[]
  body_types: Option[]
  fuel_types: Option[]
  colors: Option[]
}

export const emptyVehicleFormOptions: VehicleFormOptions = {
  vehicle_types: [], vehicle_categories: [], usage_types: [],
  body_types: [], fuel_types: [], colors: [],
}

export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}{hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}</div>
}

export function FormSelect({ name, options, value, placeholder, required = false, disabled = false }: {
  name: string; options: Option[]; value?: string | null; placeholder: string; required?: boolean; disabled?: boolean
}) {
  const hasCurrent = Boolean(value && !options.some((item) => item.value === value))
  return <select name={name} defaultValue={value || ""} required={required} disabled={disabled} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50">
    <option value="">{placeholder}</option>
    {hasCurrent ? <option value={value || ""}>{value}</option> : null}
    {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
  </select>
}

export function DateField({ label, name, value, disabled = false }: { label: string; name: string; value?: string | null; disabled?: boolean }) {
  return <FormField label={label}><DdMmYyyyInput name={name} defaultValue={value} disabled={disabled} /></FormField>
}

export function NumberField({ label, name, value, min, max, step }: { label: string; name: string; value?: number | null; min?: number; max?: number; step?: number | string }) {
  return <FormField label={label}><Input name={name} type="number" min={min} max={max} step={step} defaultValue={value ?? ""} /></FormField>
}
