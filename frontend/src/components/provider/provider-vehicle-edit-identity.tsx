import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DateField, FormField, FormSelect, type VehicleFormOptions } from "@/components/provider/vehicle-form-fields"
import type { VehicleDetails } from "@/features/vehicles/types"

export function ProviderVehicleEditIdentity({ vehicle, options }: { vehicle: VehicleDetails; options: VehicleFormOptions }) {
  const imported = vehicle.registration_number.startsWith("GOMAX-")
  return <Card>
    <CardHeader><CardTitle>Identity and basic information</CardTitle></CardHeader>
    <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <FormField label="Registered owner name" hint="Enter the owner name exactly as shown on the vehicle registration certificate. This name will appear on the vehicle certificate."><Input name="registered_owner_name" required maxLength={180} defaultValue={vehicle.registered_owner_name || vehicle.owner.owner_name} /></FormField>
      {imported ? <>
        <FormField label="Vehicle display name" hint="Imported from GoMax. You can update this name at any time."><Input name="vehicle_display_name" required maxLength={80} defaultValue={vehicle.registration_number_display || vehicle.registration_number} /></FormField>
        <FormField label="Official registration number" hint="Add this later when available. Saving it will replace the temporary GoMax ID."><Input name="official_registration_number" maxLength={80} placeholder="Add registration number later" /></FormField>
      </> : <>
        <FormField label="Registration number" hint="Checked against the global vehicle registry."><Input name="registration_number" required maxLength={80} defaultValue={vehicle.registration_number} /></FormField>
        <FormField label="Display registration number"><Input name="registration_number_display" maxLength={80} defaultValue={vehicle.registration_number_display || ""} /></FormField>
      </>}
      <FormField label="Chassis number"><Input name="chassis_number" required maxLength={120} defaultValue={vehicle.chassis_number} /></FormField>
      <FormField label="Engine number"><Input name="engine_number" maxLength={120} defaultValue={vehicle.engine_number || ""} /></FormField>
      <FormField label="Vehicle type"><FormSelect name="vehicle_type" required options={options.vehicle_types} value={vehicle.vehicle_type} placeholder="Select vehicle type" /></FormField>
      <FormField label="Vehicle category"><FormSelect name="vehicle_category" options={options.vehicle_categories} value={vehicle.vehicle_category} placeholder="Select vehicle category" /></FormField>
      <FormField label="Usage type"><FormSelect name="usage_type" options={options.usage_types} value={vehicle.usage_type} placeholder="Select usage type" /></FormField>
      <FormField label="Body type"><FormSelect name="body_type" options={options.body_types} value={vehicle.body_type} placeholder="Select body type" /></FormField>
      <FormField label="Fuel type"><FormSelect name="fuel_type" options={options.fuel_types} value={vehicle.fuel_type} placeholder="Select fuel type" /></FormField>
      <FormField label="Brand"><Input name="brand" maxLength={100} defaultValue={vehicle.brand || ""} /></FormField>
      <FormField label="Model"><Input name="model" maxLength={100} defaultValue={vehicle.model || ""} /></FormField>
      <FormField label="Manufacturing year"><Input name="manufacturing_year" type="number" min={1900} max={2200} defaultValue={vehicle.manufacturing_year ?? ""} /></FormField>
      <FormField label="Color"><FormSelect name="color" options={options.colors} value={vehicle.color} placeholder="Select vehicle color" /></FormField>
      <DateField label="Registration date" name="registration_date" value={vehicle.registration_date} />
      <FormField label="Registration authority"><Input name="registration_authority" maxLength={120} defaultValue={vehicle.registration_authority || ""} /></FormField>
    </CardContent>
  </Card>
}
