import {
  BadgeCheck,
  Building2,
  CalendarClock,
  CarFront,
  CheckCircle2,
  CircleX,
  FileCheck2,
  Fuel,
  Gauge,
  IdCard,
  RadioTower,
  ShieldCheck,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { serverEnv } from "@/config/server-env"
import { VEHICLE_DOCUMENT_DEFINITIONS } from "@/features/vehicles/document-definitions"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

type PublicDriver = {
  name: string
  driver_code: string
  verification_status: string
  assignment_status: string
  is_on_duty: boolean
  behaviour_score: number
  licence_status: string | null
  licence_expiry: string | null
}

type PublicDocument = {
  document_type: string
  status: string
  expires_at: string | null
}

type PublicVehicleVerification = {
  valid: boolean
  vehicle_id: string
  qr_issued_at: string
  registration_number: string
  vehicle_type: string
  vehicle_category: string | null
  usage_type: string | null
  body_type: string | null
  fuel_type: string | null
  brand: string | null
  model: string | null
  color: string | null
  manufacturing_year: number | null
  verification_status: string
  vehicle_status: string
  owner_name: string
  provider_name: string
  gps_online: boolean
  last_signal_at: string | null
  current_speed_kph: number
  current_driver: PublicDriver | null
  documents: PublicDocument[]
}

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })
const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function label(value: string | null | undefined) {
  if (!value) return "Not recorded"
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateFormatter.format(date)
}

function formatDateTime(value: string | null) {
  if (!value) return "No recent signal"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "No recent signal" : dateTimeFormatter.format(date)
}

async function getVerification(token: string) {
  try {
    const response = await fetch(
      `${serverEnv.apiBaseUrl}/public/qr/verify/${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    )
    if (!response.ok) return null
    return (await response.json()) as PublicVehicleVerification
  } catch {
    return null
  }
}

export default async function PublicVehicleVerificationPage({ params }: Props) {
  const { token } = await params
  const vehicle = await getVerification(token)

  if (!vehicle) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
        <Card className="w-full max-w-lg border-rose-200 text-center shadow-2xl">
          <CardHeader>
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <CircleX className="size-8" />
            </div>
            <CardTitle className="mt-4 text-2xl">Invalid vehicle QR code</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              This QR code is invalid, inactive, or the vehicle record is unavailable. Please
              contact Bangladesh National Vehicle Platform support.
            </p>
          </CardContent>
        </Card>
      </main>
    )
  }

  const verified = vehicle.verification_status === "verified" || vehicle.verification_status === "approved"
  const driver = vehicle.current_driver

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-2xl sm:px-8 lg:px-10">
          <div className="absolute -right-20 -top-24 size-96 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                <ShieldCheck className="size-3.5" /> Official QR vehicle record
              </Badge>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-100">
                  <CarFront className="size-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    {vehicle.registration_number}
                  </h1>
                  <p className="mt-2 text-base text-emerald-100/75">
                    {label(vehicle.brand)} · {label(vehicle.model)} · {label(vehicle.vehicle_type)}
                  </p>
                </div>
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-emerald-100/75">
                This read-only vehicle profile was opened from the permanent Bangladesh National
                Vehicle Platform QR credential.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-white/15 bg-white/10 px-4 py-2 text-emerald-100 hover:bg-white/10">
                QR active
              </Badge>
              <Badge className={verified ? "bg-emerald-100 px-4 py-2 text-emerald-900" : "bg-amber-100 px-4 py-2 text-amber-900"}>
                {verified ? <CheckCircle2 className="size-4" /> : <BadgeCheck className="size-4" />}
                {label(vehicle.verification_status)}
              </Badge>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Verification", label(vehicle.verification_status), ShieldCheck],
            ["Record status", label(vehicle.vehicle_status), BadgeCheck],
            ["GPS status", vehicle.gps_online ? "Online" : "Offline", vehicle.gps_online ? Wifi : WifiOff],
            ["Current speed", `${Math.round(vehicle.current_speed_kph)} km/h`, Gauge],
            ["QR issued", formatDateTime(vehicle.qr_issued_at), IdCard],
          ].map(([title, value, Icon]) => {
            const MetricIcon = Icon as typeof ShieldCheck
            return (
              <Card key={String(title)}>
                <CardContent className="flex min-h-28 items-start justify-between gap-3 p-5">
                  <div>
                    <p className="text-xs text-muted-foreground">{String(title)}</p>
                    <p className="mt-2 text-lg font-semibold">{String(value)}</p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                    <MetricIcon className="size-5" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CarFront className="size-5 text-emerald-700" /> Vehicle identity and registration
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Registration number", vehicle.registration_number],
                ["Vehicle type", label(vehicle.vehicle_type)],
                ["Category", label(vehicle.vehicle_category)],
                ["Usage type", label(vehicle.usage_type)],
                ["Body type", label(vehicle.body_type)],
                ["Fuel type", label(vehicle.fuel_type)],
                ["Brand", label(vehicle.brand)],
                ["Model", label(vehicle.model)],
                ["Manufacturing year", vehicle.manufacturing_year || "Not recorded"],
                ["Color", label(vehicle.color)],
              ].map(([title, value]) => (
                <div key={String(title)} className="rounded-2xl border bg-slate-50 p-4">
                  <p className="text-xs text-muted-foreground">{String(title)}</p>
                  <p className="mt-1 font-semibold">{String(value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRound className="size-5 text-emerald-700" /> Ownership and tracking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <UserRound className="size-4" /> Vehicle owner
                  </p>
                  <p className="mt-2 font-semibold">{vehicle.owner_name}</p>
                </div>
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building2 className="size-4" /> VTS provider
                  </p>
                  <p className="mt-2 font-semibold">{vehicle.provider_name}</p>
                </div>
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RadioTower className="size-4" /> Last GPS signal
                  </p>
                  <p className="mt-2 font-semibold">{formatDateTime(vehicle.last_signal_at)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-5 text-emerald-700" /> Current driver
              </CardTitle>
            </CardHeader>
            <CardContent>
              {driver ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border bg-slate-50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-semibold">{driver.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{driver.driver_code}</p>
                      </div>
                      <Badge variant={driver.is_on_duty ? "default" : "outline"}>
                        {driver.is_on_duty ? "On duty" : "Assigned"}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">Driver verification</p>
                      <p className="mt-1 font-semibold">{label(driver.verification_status)}</p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">Licence status</p>
                      <p className="mt-1 font-semibold">{label(driver.licence_status)}</p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">Licence expiry</p>
                      <p className="mt-1 font-semibold">{formatDate(driver.licence_expiry)}</p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">Behaviour score</p>
                      <p className="mt-1 font-semibold">{Math.round(driver.behaviour_score)}%</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-slate-50 p-10 text-center">
                  <UserRound className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 font-semibold">No driver assigned</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This vehicle currently has no active driver assignment.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="size-5 text-emerald-700" /> Vehicle document compliance
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Current approved vehicle documents and expiry readiness.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {VEHICLE_DOCUMENT_DEFINITIONS.map((definition) => {
                const document = vehicle.documents.find(
                  (item) => item.document_type === definition.value
                )
                return (
                  <div key={definition.value} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <FileCheck2 className="size-5 text-cyan-700" />
                      <Badge variant={document ? "secondary" : "outline"}>
                        {document ? label(document.status) : "Missing"}
                      </Badge>
                    </div>
                    <p className="mt-4 font-semibold">{definition.label}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Expiry: {document ? formatDate(document.expires_at) : "Not recorded"}
                    </p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </section>

        <div className="flex items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-cyan-950">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Public QR verification view</p>
            <p className="mt-1 text-sm leading-6 text-cyan-900/75">
              Sensitive phone numbers, full licence numbers, NID information, IMEI, chassis and
              exact live location are protected. Authorized police access can be added to this same
              QR workflow later without replacing the permanent vehicle QR code.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
