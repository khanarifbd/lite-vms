import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DateField, FormField } from "@/components/provider/vehicle-form-fields"

export function ProviderVehicleRegistrationCompliance({ disabled }: { disabled: boolean }) {
  return <Card>
    <CardHeader><CardTitle>4. Registration and compliance references</CardTitle></CardHeader>
    <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <DateField label="VTS installation date" name="vts_installation_date" disabled={disabled} />
      <DateField label="Fitness expiry" name="fitness_expiry_date" disabled={disabled} />
      <DateField label="Tax token expiry" name="tax_token_expiry_date" disabled={disabled} />
      <DateField label="Insurance expiry" name="insurance_expiry_date" disabled={disabled} />
      <FormField label="Route permit number"><Input name="route_permit_number" maxLength={120} disabled={disabled} /></FormField>
      <DateField label="Route permit expiry" name="route_permit_expiry_date" disabled={disabled} />
      <div className="md:col-span-2 xl:col-span-3"><FormField label="Route permit area"><Textarea name="route_permit_area" maxLength={1000} disabled={disabled} /></FormField></div>
      <div className="md:col-span-2 xl:col-span-3"><FormField label="Notes"><Textarea name="notes" maxLength={2000} disabled={disabled} /></FormField></div>
    </CardContent>
  </Card>
}
