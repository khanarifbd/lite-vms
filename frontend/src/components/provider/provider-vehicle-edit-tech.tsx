import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FormField, NumberField } from "@/components/provider/vehicle-form-fields"
import { Input } from "@/components/ui/input"
import type { VehicleDetails } from "@/features/vehicles/types"

export function ProviderVehicleEditTech({ v }: { v: VehicleDetails }) {
  return <Card><CardHeader><CardTitle>Technical information</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
    <NumberField label="Engine capacity (cc)" name="engine_capacity_cc" value={v.engine_capacity_cc} min={1} max={100000} />
    <NumberField label="Axle count" name="axle_count" value={v.axle_count} min={1} max={30} />
    <NumberField label="Gross vehicle weight (kg)" name="gross_vehicle_weight_kg" value={v.gross_vehicle_weight_kg} min={0} step="0.01" />
    <NumberField label="Seating capacity" name="seating_capacity" value={v.seating_capacity} min={1} max={500} />
    <NumberField label="Load capacity (kg)" name="load_capacity_kg" value={v.load_capacity_kg} min={0} step="0.01" />
    <FormField label="Default speed limit (km/h)"><Input name="default_speed_limit_kph" type="number" min={1} max={250} step="0.1" required defaultValue={v.default_speed_limit_kph} /></FormField>
  </CardContent></Card>
}
