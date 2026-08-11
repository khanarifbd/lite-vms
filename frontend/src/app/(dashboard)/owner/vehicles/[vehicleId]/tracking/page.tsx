import {
  ArrowLeft,
  CircleGauge,
  Compass,
  ExternalLink,
  KeyRound,
  MapPin,
  Network,
  RadioTower,
  ShieldAlert,
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

const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

type Props = {
  params: Promise<{ vehicleId: string }>
}

function statusLabel(value: string | null) {
  if (!value) return "Not available"
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
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
      <div className="mt-2 break-words text-sm font-semibold">{value}</div>
    </div>
  )
}

export default async function OwnerVehicleTrackingPage({ params }: Props) {
  const { vehicleId } = await params
  let vehicle: VehicleDetails | null = null
  let loadError: string | null = null

  try {
    vehicle = await getMyVehicleDetails(vehicleId)
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load GPS information."
  }

  if (!vehicle) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load GPS information</AlertTitle>
            <AlertDescription>{loadError || "Vehicle tracking data is unavailable."}</AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href="/owner/vehicles"><ArrowLeft /> Return to my vehicles</Link>
          </Button>
        </div>
      </div>
    )
  }

  const registration = vehicle.registration_number_display || vehicle.registration_number
  const hasLocation = vehicle.latest_latitude !== null && vehicle.latest_longitude !== null
  const mapHref = hasLocation
    ? `https://www.google.com/maps?q=${vehicle.latest_latitude},${vehicle.latest_longitude}`
    : null
  const isTesting = vehicle.tracking_assignment_status === "testing"
  const isActive = vehicle.tracking_assignment_status === "active"

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                Owner GPS visibility
              </Badge>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">GPS & tracking</h1>
                <StatusBadge status={vehicle.tracking_assignment_status || "not_assigned"} />
              </div>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                {registration} · Review the VTS provider, assigned device, connectivity, latest location, speed, heading, and ignition data.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/owner/tracking"><ArrowLeft /> Fleet tracking</Link>
              </Button>
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                <Link href={`/owner/vehicles/${vehicle.id}`}><ArrowLeft /> Vehicle overview</Link>
              </Button>
            </div>
          </div>
        </section>

        {!vehicle.tracking_assignment_id ? (
          <Alert>
            <RadioTower />
            <AlertTitle>No GPS assignment is available</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>Connect an approved VTS provider and grant access to this vehicle so they can assign and test a GPS device.</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/owner/providers"><Network /> Manage provider connections</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {isTesting ? (
          <Alert className="border-blue-200 bg-blue-50 text-blue-950">
            <RadioTower />
            <AlertTitle>Device connection testing is in progress</AlertTitle>
            <AlertDescription>
              Testing confirms that the assigned hardware can send a real GPS packet. Live national tracking starts only after the vehicle is police verified and the assignment is activated.
            </AlertDescription>
          </Alert>
        ) : null}

        {isActive && !vehicle.gps_online ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <ShieldAlert />
            <AlertTitle>Active GPS device is currently offline</AlertTitle>
            <AlertDescription>
              The assignment is active, but no recent signal was received. Contact the tracking provider if the device remains offline.
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="text-sm text-muted-foreground">GPS connectivity</p>
                <p className="mt-3 text-2xl font-semibold">{vehicle.gps_online ? "Online" : "Offline"}</p>
              </div>
              <div className={`flex size-11 items-center justify-center rounded-2xl ${vehicle.gps_online ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                <RadioTower className="size-5" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Assignment status</p>
              <div className="mt-3"><StatusBadge status={vehicle.tracking_assignment_status || "not_assigned"} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Latest speed</p>
              <p className="mt-3 text-2xl font-semibold">
                {vehicle.latest_speed_kph !== null ? `${Math.round(vehicle.latest_speed_kph)} km/h` : "Not available"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Last seen</p>
              <p className="mt-3 text-sm font-semibold">{formatDateTime(vehicle.tracking_last_seen_at)}</p>
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <CardTitle>Provider and device</CardTitle>
                {vehicle.tracking_provider_name ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/owner/providers"><Network /> Provider access</Link>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Tracking provider" value={vehicle.tracking_provider_name || "Not assigned"} />
              <DetailItem label="Source type" value={statusLabel(vehicle.tracking_source_type)} />
              <DetailItem label="Source code" value={vehicle.tracking_source_code || "Not available"} />
              <DetailItem
                label="Device identifier"
                value={vehicle.tracking_device_identifier || "Not assigned"}
                icon={<KeyRound className="size-4" />}
              />
              <DetailItem label="Device status" value={statusLabel(vehicle.tracking_device_operational_status)} />
              <DetailItem label="Assignment status" value={statusLabel(vehicle.tracking_assignment_status)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <CardTitle>Latest telemetry</CardTitle>
                {mapHref ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={mapHref} target="_blank" rel="noreferrer"><ExternalLink /> Open map</a>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Latitude" value={vehicle.latest_latitude ?? "Not available"} icon={<MapPin className="size-4" />} />
              <DetailItem label="Longitude" value={vehicle.latest_longitude ?? "Not available"} />
              <DetailItem
                label="Speed"
                value={vehicle.latest_speed_kph !== null ? `${vehicle.latest_speed_kph} km/h` : "Not available"}
                icon={<CircleGauge className="size-4" />}
              />
              <DetailItem
                label="Heading"
                value={vehicle.latest_heading !== null ? `${vehicle.latest_heading}°` : "Not available"}
                icon={<Compass className="size-4" />}
              />
              <DetailItem label="Ignition" value={vehicle.latest_ignition === null ? "Not available" : vehicle.latest_ignition ? "On" : "Off"} />
              <DetailItem label="Recorded at" value={formatDateTime(vehicle.last_recorded_at)} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Tracking workflow status</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">1. Assignment</p>
              <p className="mt-2 font-semibold">{vehicle.tracking_assignment_id ? "Device assigned" : "Waiting for provider"}</p>
            </div>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">2. Connection test</p>
              <p className="mt-2 font-semibold">{isTesting || isActive ? "Hardware packet received or testing ready" : "Not completed"}</p>
            </div>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">3. Live activation</p>
              <p className="mt-2 font-semibold">{isActive ? "National tracking active" : "Police verification and activation required"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
