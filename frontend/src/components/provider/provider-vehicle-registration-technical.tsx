import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/provider/vehicle-form-fields"

export function ProviderVehicleRegistrationTechnical({ disabled }: { disabled: boolean }) {
  return <Card>
    <CardHeader><CardTitle>3. Technical information</CardTitle></CardHeader>
    <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <FormField label="Engine capacity (cc)"><Input name="engine_capacity_cc" type="number" min={1} max={100000} disabled={disabled} /></FormField>
      <FormField label="Axle count"><Input name="axle_count" type="number" min={1} max={30} disabled={disabled} /></FormField>
      <FormField label="Gross vehicle weight (kg)"><Input name="gross_vehicle_weight_kg" type="number" min={0} step="0.01" disabled={disabled} /></FormField>
      <FormField label="Seating capacity"><Input name="seating_capacity" type="number" min={1} max={500} disabled={disabled} /></FormField>
      <FormField label="Load capacity (kg)"><Input name="load_capacity_kg" type="number" min={0} step="0.01" disabled={disabled} /></FormField>
      <FormField label="Default speed limit (km/h)"><Input name="default_speed_limit_kph" type="number" min={1} max={250} defaultValue={80} disabled={disabled} /></FormField>
    </CardContent>
  </Card>
}
