import {
  ArrowLeft,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CircleGauge,
  FileText,
  Fuel,
  MapPin,
  Network,
  Pencil,
  RadioTower,
  ShieldAlert,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { VehicleDetails } from "@/features/vehicles/types"
import { getMyVehicleDetails } from "@/lib/owner/server"

export const dynamic = "force-dynamic"

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })
const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" })
const editableStatuses = new Set(["draft", "changes_requested"])

type SearchValue = string | string[] | undefined

type Props = {
  params: Promise<{ vehicleId: string }>
  searchParams: Promise<{ updated?: SearchValue; submitted?: SearchValue }>
}

function statusLabel(value: string | null) {
  if (!value) return "Not available"
  return value.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function formatDate(value: string | null) {
  if (!value) return "Not provided"
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? "Not provided" : dateFormatter.format(parsed)
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "Not available" : dateTimeFormatter.format(parsed)
}

function DetailItem({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{icon}{label}</p>
      <div className="mt-2 break-words text-sm font-semibold">{value}</div>
    </div>
  )
}

export default async function OwnerVehicleDetailsPage({ params, searchParams }: Props) {
  const { vehicleId } = await params
  const query = await searchParams
  let vehicle: VehicleDetails | null = null
  let loadError: string | null = null

  try {
    vehicle = await getMyVehicleDetails(vehicleId)
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load vehicle details."
  }

  if (!vehicle) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-4xl space-y-5">
        <Alert variant="destructive"><ShieldAlert /><AlertTitle>Unable to load vehicle details</AlertTitle><AlertDescription>{loadError || "Vehicle data is unavailable."}</AlertDescription></Alert>
        <Button asChild variant="outline"><Link href="/owner/vehicles"><ArrowLeft /> Return to my vehicles</Link></Button>
      </div></div>
    )
  }

  const registration = vehicle.registration_number_display || vehicle.registration_number
  const canEdit = editableStatuses.has(vehicle.verification_status)
  const hasTracking = Boolean(vehicle.tracking_assignment_id)
  const trackingActive = vehicle.tracking_assignment_status === "active"

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {query.updated ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 /><AlertTitle>Vehicle changes saved</AlertTitle><AlertDescription>The registration remains in its current workflow state.</AlertDescription></Alert>
        ) : null}
        {query.submitted ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 /><AlertTitle>Vehicle submitted for review</AlertTitle><AlertDescription>The corrected registration is back in the Bangladesh Police review queue.</AlertDescription></Alert>
        ) : null}
        {vehicle.verification_status === "changes_requested" ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950"><ShieldAlert /><AlertTitle>Bangladesh Police requested registration changes</AlertTitle><AlertDescription className="space-y-3"><p>{vehicle.review_notes || "Review and correct the requested fields, then resubmit."}</p>{canEdit ? <Button asChild size="sm"><Link href={`/owner/vehicles/${vehicle.id}/edit`}><Pencil /> Correct vehicle information</Link></Button> : null}</AlertDescription></Alert>
        ) : null}
        {vehicle.verification_status === "rejected" ? (
          <Alert variant="destructive"><ShieldAlert /><AlertTitle>Vehicle registration rejected</AlertTitle><AlertDescription>{vehicle.review_notes || "No review note was provided."}</AlertDescription></Alert>
        ) : null}

        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">Owner vehicle workspace</Badge>
              <div className="mt-5 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{registration}</h1><StatusBadge status={vehicle.verification_status} /></div>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">{[vehicle.brand, vehicle.model, vehicle.vehicle_type, vehicle.manufacturing_year].filter(Boolean).join(" · ") || "Vehicle information pending"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary"><Link href="/owner/vehicles"><ArrowLeft /> My vehicles</Link></Button>
              {canEdit ? <Button asChild className="bg-amber-100 text-amber-950 hover:bg-amber-200"><Link href={`/owner/vehicles/${vehicle.id}/edit`}><Pencil /> Edit registration</Link></Button> : null}
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50"><Link href={`/owner/vehicles/${vehicle.id}/documents`}><FileText /> Documents</Link></Button>
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50"><Link href={`/owner/vehicles/${vehicle.id}/tracking`}><RadioTower /> GPS details</Link></Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Verification" value={<StatusBadge status={vehicle.verification_status} />} icon={<ShieldAlert className="size-4" />} />
          <DetailItem label="GPS connection" value={vehicle.gps_online ? "Online" : hasTracking ? "Offline" : "Not assigned"} icon={<RadioTower className="size-4" />} />
          <DetailItem label="Tracking status" value={statusLabel(vehicle.tracking_assignment_status)} icon={<CircleGauge className="size-4" />} />
          <DetailItem label="Last GPS record" value={formatDateTime(vehicle.tracking_last_seen_at)} icon={<MapPin className="size-4" />} />
        </section>

        <Card className={hasTracking ? "border-emerald-200" : "border-amber-200"}>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle className="flex items-center gap-2"><RadioTower className="size-5 text-emerald-700" /> GPS device and provider</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">See the assigned provider, device identity, connection state, and latest telemetry.</p>
              </div>
              <StatusBadge status={vehicle.tracking_assignment_status || "not_assigned"} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailItem label="Tracking provider" value={vehicle.tracking_provider_name || "Not connected"} icon={<Network className="size-4" />} />
              <DetailItem label="Device / IMEI" value={vehicle.tracking_device_identifier || "Not assigned"} />
              <DetailItem label="Device status" value={statusLabel(vehicle.tracking_device_operational_status)} />
              <DetailItem label="Telemetry source" value={vehicle.tracking_source_code || statusLabel(vehicle.tracking_source_type)} />
              <DetailItem label="Latest speed" value={vehicle.latest_speed_kph !== null ? `${Math.round(vehicle.latest_speed_kph)} km/h` : "Not available"} />
              <DetailItem label="Ignition" value={vehicle.latest_ignition === null ? "Not available" : vehicle.latest_ignition ? "On" : "Off"} />
              <DetailItem label="Last recorded" value={formatDateTime(vehicle.last_recorded_at)} />
              <DetailItem label="GPS connectivity" value={vehicle.gps_online ? "Online" : "Offline"} />
            </div>

            {!hasTracking ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                <RadioTower />
                <AlertTitle>No GPS device is assigned</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>Approve a VTS provider connection for this vehicle. The provider can then assign the IMEI/device, or the first valid telemetry packet can create the initial assignment automatically.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm"><Link href="/owner/providers"><Network /> Manage provider connections</Link></Button>
                    <Button asChild size="sm" variant="outline"><Link href={`/owner/vehicles/${vehicle.id}/tracking`}>Open GPS status</Link></Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-slate-50 p-4">
                <div>
                  <p className="font-semibold">{trackingActive ? "National tracking is active" : `GPS workflow: ${statusLabel(vehicle.tracking_assignment_status)}`}</p>
                  <p className="mt-1 text-sm text-muted-foreground">The VTS provider manages device replacement. You control the provider connection and can review every status here.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm"><Link href={`/owner/vehicles/${vehicle.id}/tracking`}><RadioTower /> Full GPS details</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link href="/owner/providers"><Network /> Provider access</Link></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>Registration identity</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Registration number" value={vehicle.registration_number} />
            <DetailItem label="Display registration" value={registration} />
            <DetailItem label="Chassis number" value={vehicle.chassis_number} />
            <DetailItem label="Engine number" value={vehicle.engine_number || "Not provided"} />
            <DetailItem label="Registration date" value={formatDate(vehicle.registration_date)} />
            <DetailItem label="Registration authority" value={vehicle.registration_authority || "Not provided"} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Ownership and registration source</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Registered owner" value={vehicle.owner.owner_name} />
            <DetailItem label="Owner code" value={vehicle.owner.owner_code || "Pending"} />
            <DetailItem label="Registered by" value={vehicle.created_by_provider_name || "Owner self-registration"} />
            <DetailItem label="Record status" value={statusLabel(vehicle.status)} />
          </CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle>Vehicle identity and basic information</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <DetailItem label="Vehicle type" value={vehicle.vehicle_type} />
          <DetailItem label="Category" value={vehicle.vehicle_category || "Not provided"} />
          <DetailItem label="Usage type" value={vehicle.usage_type || "Not provided"} />
          <DetailItem label="Body type" value={vehicle.body_type || "Not provided"} />
          <DetailItem label="Fuel type" value={statusLabel(vehicle.fuel_type)} icon={<Fuel className="size-4" />} />
          <DetailItem label="Brand" value={vehicle.brand || "Not provided"} />
          <DetailItem label="Model" value={vehicle.model || "Not provided"} />
          <DetailItem label="Manufacturing year" value={vehicle.manufacturing_year || "Not provided"} icon={<CalendarDays className="size-4" />} />
          <DetailItem label="Color" value={vehicle.color || "Not provided"} />
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Technical information</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Engine capacity" value={vehicle.engine_capacity_cc ? `${vehicle.engine_capacity_cc} cc` : "Not provided"} icon={<Wrench className="size-4" />} />
          <DetailItem label="Axle count" value={vehicle.axle_count || "Not provided"} />
          <DetailItem label="Gross vehicle weight" value={vehicle.gross_vehicle_weight_kg !== null ? `${vehicle.gross_vehicle_weight_kg} kg` : "Not provided"} />
          <DetailItem label="Seating capacity" value={vehicle.seating_capacity || "Not provided"} />
          <DetailItem label="Load capacity" value={vehicle.load_capacity_kg !== null ? `${vehicle.load_capacity_kg} kg` : "Not provided"} />
          <DetailItem label="Default speed limit" value={`${vehicle.default_speed_limit_kph} km/h`} icon={<CircleGauge className="size-4" />} />
        </CardContent></Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>Compliance and route permit</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Fitness status" value={statusLabel(vehicle.fitness_status)} />
            <DetailItem label="Fitness expiry" value={formatDate(vehicle.fitness_expiry_date)} />
            <DetailItem label="Tax token status" value={statusLabel(vehicle.tax_token_status)} />
            <DetailItem label="Tax token expiry" value={formatDate(vehicle.tax_token_expiry_date)} />
            <DetailItem label="Insurance status" value={statusLabel(vehicle.insurance_status)} />
            <DetailItem label="Insurance expiry" value={formatDate(vehicle.insurance_expiry_date)} />
            <DetailItem label="Route permit number" value={vehicle.route_permit_number || "Not provided"} />
            <DetailItem label="Route permit area" value={vehicle.route_permit_area || "Not provided"} />
            <DetailItem label="Route permit status" value={statusLabel(vehicle.route_permit_status)} />
            <DetailItem label="Route permit expiry" value={formatDate(vehicle.route_permit_expiry_date)} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Police review and notes</CardTitle></CardHeader><CardContent className="grid gap-4">
            <DetailItem label="Police review notes" value={vehicle.review_notes || "No active review note"} />
            <DetailItem label="Last updated" value={formatDateTime(vehicle.updated_at)} />
            <DetailItem label="Owner notes" value={vehicle.notes || "No owner note"} />
          </CardContent></Card>
        </div>
      </div>
    </div>
  )
}
