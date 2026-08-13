import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { VehicleRegistrationOwnerOption } from "@/components/vehicle/vehicle-registration-form"
import { DateField, FormField, FormSelect, type VehicleFormOptions } from "@/components/provider/vehicle-form-fields"

export function ProviderVehicleRegistrationIdentity({ owners, options, disabled, optionsLoading }: {
  owners: VehicleRegistrationOwnerOption[]
  options: VehicleFormOptions
  disabled: boolean
  optionsLoading: boolean
}) {
  return <>
    <Card>
      <CardHeader><CardTitle>1. Vehicle owner</CardTitle></CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <FormField label="Vehicle owner">
          <select name="owner_id" required disabled={!owners.length || disabled} defaultValue="" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50">
            <option value="" disabled>Select an approved active-linked owner</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.owner_name} · {owner.owner_code || owner.identity_reference}</option>)}
          </select>
        </FormField>
        <div className="rounded-2xl border bg-slate-50 p-4 text-sm leading-6 text-muted-foreground">Only approved owners with an active provider connection are available here.</div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>2. Vehicle identity and basic information</CardTitle></CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <FormField label="Registered owner name" hint="Enter the owner name exactly as shown on the vehicle registration certificate. This name will appear on the vehicle certificate."><Input name="registered_owner_name" required maxLength={180} disabled={disabled} /></FormField>
        <FormField label="Registration number" hint="Bangladesh registration format; checked globally for duplicates."><Input name="registration_number" required maxLength={80} disabled={disabled} /></FormField>
        <FormField label="Display registration number"><Input name="registration_number_display" maxLength={80} disabled={disabled} /></FormField>
        <FormField label="Chassis number" hint="Normalized and checked globally for duplicates."><Input name="chassis_number" required maxLength={120} disabled={disabled} /></FormField>
        <FormField label="Engine number"><Input name="engine_number" maxLength={120} disabled={disabled} /></FormField>
        <FormField label="Vehicle type"><FormSelect name="vehicle_type" required options={options.vehicle_types} placeholder={optionsLoading ? "Loading vehicle types..." : "Select vehicle type"} disabled={disabled || optionsLoading} /></FormField>
        <FormField label="Vehicle category"><FormSelect name="vehicle_category" options={options.vehicle_categories} placeholder="Select vehicle category" disabled={disabled || optionsLoading} /></FormField>
        <FormField label="Usage type"><FormSelect name="usage_type" options={options.usage_types} placeholder="Select usage type" disabled={disabled || optionsLoading} /></FormField>
        <FormField label="Body type"><FormSelect name="body_type" options={options.body_types} placeholder="Select body type" disabled={disabled || optionsLoading} /></FormField>
        <FormField label="Fuel type"><FormSelect name="fuel_type" options={options.fuel_types} placeholder="Select fuel type" disabled={disabled || optionsLoading} /></FormField>
        <FormField label="Brand"><Input name="brand" maxLength={100} disabled={disabled} /></FormField>
        <FormField label="Model"><Input name="model" maxLength={100} disabled={disabled} /></FormField>
        <FormField label="Manufacturing year"><Input name="manufacturing_year" type="number" min={1900} max={2200} disabled={disabled} /></FormField>
        <FormField label="Color"><FormSelect name="color" options={options.colors} placeholder="Select vehicle color" disabled={disabled || optionsLoading} /></FormField>
        <DateField label="Registration date" name="registration_date" disabled={disabled} />
        <FormField label="Registration authority"><Input name="registration_authority" maxLength={120} placeholder="BRTA office" disabled={disabled} /></FormField>
      </CardContent>
    </Card>
  </>
}
