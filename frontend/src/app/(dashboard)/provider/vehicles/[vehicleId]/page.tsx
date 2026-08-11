import {
  ArrowLeft,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CircleGauge,
  FileText,
  Fuel,
  MapPin,
  Pencil,
  RadioTower,
  ShieldAlert,
  Smartphone,
  UserRound,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { ProviderVehicleSubmitButton } from "@/components/provider/provider-vehicle-submit-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ProviderVehicleDetails } from "@/features/provider/vehicle-detail-types"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyProviderApplication } from "@/lib/provider/server"
import { getProviderVehicleDetails } from "@/lib/provider/vehicle-server"

export const dynamic = "force-dynamic"

const vehicleReadRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsTechnical,
  USER_ROLES.vtsViewer,
] as const
const vehicleManageRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator] as const
const editableStatuses = new Set(["draft", "changes_requested"])

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })
const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

type ProviderVehicleDetailsPageProps = {
  params: Promise<{ vehicleId: string }>
  searchParams: Promise<{ updated?: string; submitted?: string }>
}

function statusLabel(value: string | null) {
  if (!value) return "Not available"
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatDate(value: string | null) {
  if (!value) return "Not provided"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? "Not provided" : dateFormatter.format(date)
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateTimeFormatter.format(date)
}

function DetailItem({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="mt-2 break-words text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}

export default async function ProviderVehicleDetailsPage({
  params,
  searchParams,
}: ProviderVehicleDetailsPageProps) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, vehicleReadRoles)) redirect("/provider/dashboard")

  const application = await getMyProviderApplication()
  if (!application) redirect("/provider/application")
  if (application.status !== "approved") redirect("/provider/vehicles")

  const { vehicleId } = await params
  const query = await searchParams
  let vehicle: ProviderVehicleDetails | null = null
  let loadError: string | null = null

  try {
    vehicle = await getProviderVehicleDetails(vehicleId)
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load vehicle details."
  }

  if (!vehicle) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load vehicle details</AlertTitle>
            <AlertDescription>{loadError || "Vehicle data is unavailable."}</AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href="/provider/vehicles">
              <ArrowLeft /> Return to vehicle registry
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const canManage = userHasAnyRole(user, vehicleManageRoles)
  const canEdit = canManage && editableStatuses.has(vehicle.verification_status)
  const registration = vehicle.registration_number_display || vehicle.registration_number
  const gpsAssigned = Boolean(vehicle.tracking_device_identifier)
  const gpsActionLabel = gpsAssigned ? "Manage / replace GPS" : "Add GPS / IMEI"

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {query.updated === "1" ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
            <CheckCircle2 />
            <AlertTitle>Vehicle changes saved</AlertTitle>
            <AlertDescription>The vehicle record has been updated successfully.</AlertDescription>
          </Alert>
        ) : null}

        {query.submitted === "1" ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
            <CheckCircle2 />
            <AlertTitle>Vehicle submitted for police review</AlertTitle>
            <AlertDescription>Bangladesh Police can now review this registration.</AlertDescription>
          </Alert>
        ) : null}

        {vehicle.verification_status === "changes_requested" ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <ShieldAlert />
            <AlertTitle>Registration changes requested</AlertTitle>
            <AlertDescription>{vehicle.review_notes || "Correct the registration information and resubmit it."}</AlertDescription>
          </Alert>
        ) : null}

        {vehicle.verification_status === "rejected" ? (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Vehicle registration rejected</AlertTitle>
            <AlertDescription>{vehicle.review_notes || "No review note was provided."}</AlertDescription>
          </Alert>
        ) : null}

        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                Full vehicle record
              </Badge>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{registration}</h1>
                <StatusBadge status={vehicle.verification_status} />
              </div>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                {[vehicle.brand, vehicle.model, vehicle.vehicle_type, vehicle.manufacturing_year]
                  .filter(Boolean)
                  .join(" · ") || "Vehicle information pending"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/provider/vehicles">
                  <ArrowLeft /> Registry
                </Link>
              </Button>
              <Button asChild className="bg-emerald-100 text-emerald-950 hover:bg-white">
                <Link href={`/provider/vehicles/${vehicle.id}/tracking`}>
                  <RadioTower /> {gpsActionLabel}
                </Link>
              </Button>
              {canEdit ? (
                <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                  <Link href={`/provider/vehicles/${vehicle.id}/edit`}>
                    <Pencil /> Edit vehicle
                  </Link>
                </Button>
              ) : null}
              {canManage && vehicle.verification_status === "draft" ? (
                <ProviderVehicleSubmitButton vehicleId={vehicle.id} />
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem
            label="Workflow status"
            value={<StatusBadge status={vehicle.verification_status} />}
            icon={<ShieldAlert className="size-4" />}
          />
          <DetailItem label="Record status" value={statusLabel(vehicle.status)} icon={<CarFront className="size-4" />} />
          <DetailItem
            label="GPS status"
            value={vehicle.gps_online ? "Online" : gpsAssigned ? "Assigned / offline" : "Not assigned"}
            icon={<RadioTower className="size-4" />}
          />
          <DetailItem
            label="Last tracking record"
            value={formatDateTime(vehicle.tracking_last_seen_at)}
            icon={<MapPin className="size-4" />}
          />
        </section>

        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <RadioTower className="size-5 text-emerald-800" /> Tracking and GPS device
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add the first IMEI, review the auto-bound device, update optional details, or replace the current GPS device.
                </p>
              </div>
              <Button asChild>
                <Link href={`/provider/vehicles/${vehicle.id}/tracking`}>
                  <Smartphone /> {gpsActionLabel}
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem label="Assignment status" value={statusLabel(vehicle.tracking_assignment_status)} />
            <DetailItem label="IMEI / device identifier" value={vehicle.tracking_device_identifier || "Waiting for first packet"} />
            <DetailItem label="Device status" value={statusLabel(vehicle.tracking_device_operational_status)} />
            <DetailItem label="Tracking provider" value={vehicle.tracking_provider_name || application.legal_name} />
            <DetailItem label="Telemetry source" value={vehicle.tracking_source_code || "Managed automatically"} />
            <DetailItem
              label="Latest speed"
              value={vehicle.latest_speed_kph !== null ? `${Math.round(vehicle.latest_speed_kph)} km/h` : "Not available"}
            />
            <DetailItem
              label="Latest ignition"
              value={vehicle.latest_ignition === null ? "Not available" : vehicle.latest_ignition ? "On" : "Off"}
            />
            <DetailItem label="Last packet" value={formatDateTime(vehicle.tracking_last_seen_at)} />
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Owner and provider information</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Vehicle owner" value={vehicle.owner.owner_name} icon={<UserRound className="size-4" />} />
              <DetailItem label="Owner code" value={vehicle.owner.owner_code || "Pending"} />
              <DetailItem label="Owner phone" value={vehicle.owner.phone || "Not provided"} />
              <DetailItem label="Owner email" value={vehicle.owner.email || "Not provided"} />
              <DetailItem label="Registered by provider" value={vehicle.created_by_provider_name || "Not recorded"} />
              <DetailItem label="Tracking provider" value={vehicle.tracking_provider_name || "Not assigned"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Review information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <DetailItem label="Review status" value={statusLabel(vehicle.verification_status)} />
              <DetailItem label="Bangladesh Police review notes" value={vehicle.review_notes || "No active review note"} />
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label="Created" value={formatDateTime(vehicle.created_at)} />
                <DetailItem label="Last updated" value={formatDateTime(vehicle.updated_at)} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Vehicle identity and basic information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <DetailItem label="Registration number" value={vehicle.registration_number} />
            <DetailItem label="Display registration" value={registration} />
            <DetailItem label="Chassis number" value={vehicle.chassis_number} />
            <DetailItem label="Engine number" value={vehicle.engine_number || "Not provided"} />
            <DetailItem label="Vehicle type" value={vehicle.vehicle_type} />
            <DetailItem label="Category" value={vehicle.vehicle_category || "Not provided"} />
            <DetailItem label="Usage type" value={vehicle.usage_type || "Not provided"} />
            <DetailItem label="Body type" value={vehicle.body_type || "Not provided"} />
            <DetailItem label="Fuel type" value={statusLabel(vehicle.fuel_type)} icon={<Fuel className="size-4" />} />
            <DetailItem label="Brand" value={vehicle.brand || "Not provided"} />
            <DetailItem label="Model" value={vehicle.model || "Not provided"} />
            <DetailItem label="Manufacturing year" value={vehicle.manufacturing_year || "Not provided"} />
            <DetailItem label="Color" value={vehicle.color || "Not provided"} />
            <DetailItem label="Registration date" value={formatDate(vehicle.registration_date)} icon={<CalendarDays className="size-4" />} />
            <DetailItem label="Registration authority" value={vehicle.registration_authority || "Not provided"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Technical and compliance information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <DetailItem label="Engine capacity" value={vehicle.engine_capacity_cc ? `${vehicle.engine_capacity_cc} cc` : "Not provided"} icon={<Wrench className="size-4" />} />
            <DetailItem label="Axle count" value={vehicle.axle_count || "Not provided"} />
            <DetailItem label="Gross vehicle weight" value={vehicle.gross_vehicle_weight_kg !== null ? `${vehicle.gross_vehicle_weight_kg} kg` : "Not provided"} />
            <DetailItem label="Seating capacity" value={vehicle.seating_capacity || "Not provided"} />
            <DetailItem label="Load capacity" value={vehicle.load_capacity_kg !== null ? `${vehicle.load_capacity_kg} kg` : "Not provided"} />
            <DetailItem label="Default speed limit" value={`${vehicle.default_speed_limit_kph} km/h`} icon={<CircleGauge className="size-4" />} />
            <DetailItem label="Fitness expiry" value={formatDate(vehicle.fitness_expiry_date)} />
            <DetailItem label="Tax token expiry" value={formatDate(vehicle.tax_token_expiry_date)} />
            <DetailItem label="Insurance expiry" value={formatDate(vehicle.insurance_expiry_date)} />
            <DetailItem label="Route permit number" value={vehicle.route_permit_number || "Not provided"} />
            <DetailItem label="Route permit expiry" value={formatDate(vehicle.route_permit_expiry_date)} />
            <DetailItem label="Route permit area" value={vehicle.route_permit_area || "Not provided"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <CardTitle>Vehicle documents</CardTitle>
              <Badge variant="outline">{vehicle.documents.length} document(s)</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {vehicle.documents.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {vehicle.documents.map((document) => (
                  <div key={document.id} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm">
                          <FileText className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold">{statusLabel(document.document_type)}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {document.file_name || document.document_number || "Document record"}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={document.status} />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Expires: {formatDate(document.expires_at)} · Version {document.version}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 font-semibold">No vehicle documents uploaded</p>
                <p className="mt-1 text-sm text-muted-foreground">Documents can be added from the vehicle registration workflow.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {vehicle.notes ? (
          <Card>
            <CardHeader><CardTitle>Provider notes</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{vehicle.notes}</p></CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
