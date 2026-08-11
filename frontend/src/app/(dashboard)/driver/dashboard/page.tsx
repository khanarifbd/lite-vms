import {
  AlertTriangle,
  CalendarClock,
  CarFront,
  ClipboardCheck,
  Gauge,
  IdCard,
  Link2,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"

import { DriverConnectionWorkspace } from "@/components/driver/driver-connection-workspace"
import { DriverDutyHistory } from "@/components/driver/duty-history"
import { DutyHandoverButton } from "@/components/driver/duty-handover-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getDriverDutyHistory,
  getDriverProfile,
} from "@/features/driver/data"

export const dynamic = "force-dynamic"

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })
const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

function formatDateTime(value: string | null) {
  if (!value) return "Not assigned"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not assigned" : dateTimeFormatter.format(date)
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ")
}

export default async function DriverDashboardPage() {
  const [driver, dutyHistory] = await Promise.all([
    getDriverProfile(),
    getDriverDutyHistory({ limit: 20 }),
  ])
  const requiredDocuments = new Set([
    "national_id_front",
    "driving_licence_front",
    "driver_photo",
  ])
  const uploadedTypes = new Set(driver.documents.map((item) => item.document_type))
  const applicationComplete =
    driver.present_address !== "Application details pending" &&
    driver.district !== "Pending" &&
    driver.licence.vehicle_classes.length > 0 &&
    [...requiredDocuments].every((item) => uploadedTypes.has(item))
  const actionableLinks = driver.links.filter(
    (item) => item.status === "pending_driver_approval"
  )
  const activeLinks = driver.links.filter((item) => item.status === "active")
  const licenceExpired = driver.licence.verification_status === "expired"

  const metrics = [
    {
      label: "Verification",
      value: statusLabel(driver.verification_status),
      detail: applicationComplete ? "Application submitted" : "Profile completion required",
      icon: ShieldCheck,
    },
    {
      label: "Behaviour score",
      value: `${Math.round(driver.behaviour_score)}%`,
      detail: "National driver safety score",
      icon: Gauge,
    },
    {
      label: "Licence",
      value: statusLabel(driver.licence.verification_status),
      detail: `Expires ${formatDate(driver.licence.expiry_date)}`,
      icon: IdCard,
    },
    {
      label: "Active connections",
      value: activeLinks.length.toLocaleString("en-US"),
      detail: `${actionableLinks.length} requiring your decision`,
      icon: Link2,
    },
  ]

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-emerald-950 px-5 py-5 text-white shadow-lg sm:px-6 sm:py-6 lg:px-7">
          <div className="absolute -right-20 -top-24 size-64 rounded-full border border-white/10" />
          <div className="absolute -bottom-24 right-24 size-64 rounded-full bg-emerald-700/20 blur-3xl" />
          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(500px,0.85fr)] xl:items-end">
            <div>
              <Badge className="border-white/15 bg-white/10 text-[11px] text-emerald-100 hover:bg-white/10">
                <Gauge className="size-3.5" /> Driver operational workspace
              </Badge>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300 sm:text-xs">
                {driver.driver_code}
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
                Good day, {driver.full_name}.
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-emerald-100/75 sm:text-sm sm:leading-6">
                Review your verification, BRTA licence, organization links, and active vehicle assignment from one driver workspace.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 xl:grid-cols-2">
              {metrics.map(({ label, value, detail, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3 backdrop-blur">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-emerald-100/65">{label}</p>
                    <Icon className="size-3.5 text-emerald-200" />
                  </div>
                  <p className="mt-1 truncate text-lg font-semibold capitalize">{value}</p>
                  <p className="mt-0.5 truncate text-[9px] text-emerald-100/55">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {!applicationComplete || actionableLinks.length || licenceExpired ? (
          <section className="grid gap-3 lg:grid-cols-3">
            {!applicationComplete ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-amber-100"><ClipboardCheck className="size-4.5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Complete driver application</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">Add profile details and the required NID, licence, and driver photo documents.</p>
                    <Button asChild size="sm" className="mt-3 h-8 bg-amber-700 text-xs text-white hover:bg-amber-800"><Link href="/driver/application">Continue application</Link></Button>
                  </div>
                </div>
              </div>
            ) : null}
            {actionableLinks.length ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
                <div className="flex items-start gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-sky-100"><Link2 className="size-4.5" /></div><div><p className="text-sm font-semibold">Connection requests</p><p className="mt-1 text-xs leading-5 text-sky-800">{actionableLinks.length} owner or VTS provider connection request requires your response.</p></div></div>
              </div>
            ) : null}
            {licenceExpired ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950">
                <div className="flex items-start gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-red-100"><AlertTriangle className="size-4.5" /></div><div><p className="text-sm font-semibold">Driving licence expired</p><p className="mt-1 text-xs leading-5 text-red-800">Update the licence record before accepting a vehicle assignment.</p></div></div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">Current duty</p><h2 className="mt-1 text-lg font-semibold">Vehicle roster</h2></div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant={driver.current_vehicle_id ? "default" : "secondary"}>
                  {driver.current_vehicle_id
                    ? driver.current_assignment_is_on_duty
                      ? "On duty"
                      : "Standby"
                    : "Not assigned"}
                </Badge>
                {driver.current_assignment_id && !driver.current_assignment_is_on_duty ? (
                  <DutyHandoverButton assignmentId={driver.current_assignment_id} />
                ) : null}
              </div>
            </div>
            {driver.current_vehicle_id ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2"><div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><CarFront className="size-5" /></div><div><p className="text-xs text-muted-foreground">Assigned vehicle</p><p className="mt-0.5 text-lg font-semibold">{driver.current_vehicle_registration}</p></div></div></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Vehicle owner</p><p className="mt-1 text-sm font-semibold">{driver.current_owner_name || "Not available"}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">VTS provider</p><p className="mt-1 text-sm font-semibold">{driver.current_provider_name || "Not available"}</p></div>
                <div className="rounded-xl border p-3 sm:col-span-2"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="size-3.5" /> Assignment started</p><p className="mt-1 text-sm font-semibold">{formatDateTime(driver.current_assignment_started_at)}</p></div>
              </div>
            ) : (
              <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 px-5 text-center"><CarFront className="size-8 text-emerald-700" /><p className="mt-3 text-sm font-semibold">No active vehicle roster</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">An approved owner or provider can add a verified driver to a vehicle roster.</p></div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">Identity</p><h2 className="mt-1 text-lg font-semibold">Licence and verification</h2></div><Badge variant="outline" className="capitalize">{statusLabel(driver.verification_status)}</Badge></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Licence number</p><p className="mt-1 text-sm font-semibold">{driver.licence.licence_number}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Licence type</p><p className="mt-1 text-sm font-semibold capitalize">{statusLabel(driver.licence.licence_type)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Vehicle classes</p><p className="mt-1 text-sm font-semibold">{driver.licence.vehicle_classes.join(", ") || "Not submitted"}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Licence expiry</p><p className="mt-1 text-sm font-semibold">{formatDate(driver.licence.expiry_date)}</p></div>
            </div>
            {driver.review_notes ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-medium text-amber-900">Police review note</p><p className="mt-1 text-xs leading-5 text-amber-800">{driver.review_notes}</p></div> : null}
          </div>
        </section>

        <DriverDutyHistory initialData={dutyHistory} />

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <DriverConnectionWorkspace links={driver.links} />
        </section>
      </div>
    </div>
  )
}
