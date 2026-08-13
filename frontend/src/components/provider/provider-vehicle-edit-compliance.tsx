import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DateField, FormField } from "@/components/provider/vehicle-form-fields"
import type { VehicleDetails } from "@/features/vehicles/types"

export function ProviderVehicleEditCompliance({ v }: { v: VehicleDetails }) {
  return <Card><CardHeader><CardTitle>Compliance and route permit</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
    <DateField label="VTS installation date" name="vts_installation_date" value={v.vts_installation_date} />
    <DateField label="Fitness expiry date" name="fitness_expiry_date" value={v.fitness_expiry_date} />
    <DateField label="Tax token expiry date" name="tax_token_expiry_date" value={v.tax_token_expiry_date} />
    <DateField label="Insurance expiry date" name="insurance_expiry_date" value={v.insurance_expiry_date} />
    <FormField label="Route permit number"><Input name="route_permit_number" maxLength={120} defaultValue={v.route_permit_number || ""} /></FormField>
    <DateField label="Route permit expiry date" name="route_permit_expiry_date" value={v.route_permit_expiry_date} />
    <div className="md:col-span-2 xl:col-span-3"><FormField label="Route permit area"><Textarea name="route_permit_area" rows={3} maxLength={1000} defaultValue={v.route_permit_area || ""} /></FormField></div>
    <div className="md:col-span-2 xl:col-span-3"><FormField label="Provider notes"><Textarea name="notes" rows={4} maxLength={2000} defaultValue={v.notes || ""} /></FormField></div>
  </CardContent></Card>
}
