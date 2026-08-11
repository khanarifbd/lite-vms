import { ArrowLeft, Gauge, MapPin, RadioTower, Satellite, Wifi, WifiOff } from "lucide-react"
import Link from "next/link"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { VehicleWorkspaceHero } from "@/components/vehicles/vehicle-workspace-hero"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminVehicle } from "@/features/super-admin/vehicle-review"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ vehicleId: string }> }

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" })

function formatDate(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

function text(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "Not available" : String(value)
}

export default async function SuperAdminVehicleTrackingPage({ params }: Props) {
  const { vehicleId } = await params
  const { vehicle } = await getAdminVehicle(vehicleId)
  const registration = vehicle.registration_number_display || vehicle.registration_number

  const metrics = [
    { title: "GPS connectivity", value: vehicle.gps_online ? "Online" : "Offline", icon: vehicle.gps_online ? Wifi : WifiOff },
    { title: "Assignment status", value: text(vehicle.tracking_assignment_status), icon: RadioTower },
    { title: "Latest speed", value: vehicle.gps_online ? `${Math.round(vehicle.latest_speed_kph || 0)} km/h` : "0 km/h", icon: Gauge },
    { title: "Last signal", value: formatDate(vehicle.tracking_last_seen_at || vehicle.last_recorded_at), icon: Satellite },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <VehicleWorkspaceHero
          eyebrow="National GPS oversight"
          title="GPS & tracking"
          description={
            <>
              {registration} · Review the active assignment, provider, telemetry source, device
              health, current position, and latest movement data.
            </>
          }
          actions={
            <Button asChild variant="secondary">
              <Link href={`/super-admin/vehicles/${vehicle.id}`}>
                <ArrowLeft /> Vehicle overview
              </Link>
            </Button>
          }
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ title, value, icon: Icon }) => (
            <Card key={title}>
              <CardContent className="flex min-h-28 items-start justify-between gap-3 p-5">
                <div>
                  <p className="text-xs text-muted-foreground">{title}</p>
                  <p className="mt-2 text-xl font-semibold capitalize">{value.replaceAll("_", " ")}</p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                  <Icon className="size-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RadioTower className="size-5 text-emerald-700" /> Tracking assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs text-muted-foreground">Tracking provider</p>
                <p className="mt-1 font-semibold">{vehicle.tracking_provider_name || "Not connected"}</p>
                {vehicle.tracking_provider_id ? (
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href={`/super-admin/providers/${vehicle.tracking_provider_id}`}>Open provider profile</Link>
                  </Button>
                ) : null}
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs text-muted-foreground">Telemetry source</p>
                <p className="mt-1 font-semibold">{vehicle.tracking_source_code || "Not assigned"}</p>
                <p className="mt-1 text-xs text-muted-foreground capitalize">
                  {text(vehicle.tracking_source_type).replaceAll("_", " ")}
                </p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs text-muted-foreground">Device / IMEI</p>
                <p className="mt-1 break-all font-semibold">{vehicle.tracking_device_identifier || "Not assigned"}</p>
                <div className="mt-2">
                  <StatusBadge status={vehicle.tracking_device_operational_status || "not_assigned"} />
                </div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs text-muted-foreground">Assignment identifier</p>
                <p className="mt-1 break-all font-mono text-xs">{vehicle.tracking_assignment_id || "Not assigned"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-5 text-emerald-700" /> Latest telemetry
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs text-muted-foreground">Latitude</p>
                <p className="mt-1 font-semibold">{text(vehicle.latest_latitude)}</p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs text-muted-foreground">Longitude</p>
                <p className="mt-1 font-semibold">{text(vehicle.latest_longitude)}</p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs text-muted-foreground">Heading</p>
                <p className="mt-1 font-semibold">
                  {vehicle.latest_heading === null ? "Not available" : `${Math.round(vehicle.latest_heading)}°`}
                </p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs text-muted-foreground">Ignition</p>
                <p className="mt-1 font-semibold">
                  {vehicle.latest_ignition === null ? "Unknown" : vehicle.latest_ignition ? "On" : "Off"}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
