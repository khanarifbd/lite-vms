import {
  CarFront,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Gauge,
  LockKeyhole,
  MapPin,
  Plus,
  RadioTower,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ProviderVehiclePage } from "@/features/provider/vehicle-types"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyProviderApplication } from "@/lib/provider/server"
import { getProviderVehicles } from "@/lib/provider/vehicle-server"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 12
const vehicleReadRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsTechnical,
  USER_ROLES.vtsViewer,
] as const
const vehicleManageRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator] as const

const verificationStatuses = [
  "draft",
  "pending_verification",
  "under_review",
  "verified",
  "changes_requested",
  "rejected",
  "suspended",
  "decommissioned",
] as const
const gpsStatuses = ["online", "offline"] as const
const trackingStatuses = [
  "pending_provider_confirmation",
  "testing",
  "active",
  "ended",
  "rejected",
] as const

// Tracking remains implemented for a later product phase, but is intentionally
// hidden from the BTS vehicle-management workspace.
const trackingUiEnabled = false

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

type SearchValue = string | string[] | undefined

type ProviderVehiclesPageProps = {
  searchParams: Promise<{
    page?: SearchValue
    search?: SearchValue
    status?: SearchValue
    gps?: SearchValue
    tracking?: SearchValue
    cursor?: SearchValue
  }>
}

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value: string | null) {
  if (!value) return "No tracking data"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "No tracking data" : dateFormatter.format(date)
}

function statusLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function pageHref(
  cursor: string,
  filters: { search: string; status: string; gps: string; tracking: string }
) {
  const params = new URLSearchParams()
  if (cursor) params.set("cursor", cursor)
  if (filters.search) params.set("search", filters.search)
  if (filters.status) params.set("status", filters.status)
  if (filters.gps) params.set("gps", filters.gps)
  if (filters.tracking) params.set("tracking", filters.tracking)
  const query = params.toString()
  return query ? `/provider/vehicles?${query}` : "/provider/vehicles"
}

export default async function ProviderVehiclesPage({ searchParams }: ProviderVehiclesPageProps) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, vehicleReadRoles)) redirect("/provider/dashboard")

  const application = await getMyProviderApplication()
  if (!application) redirect("/provider/application")

  if (application.status !== "approved") {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <LockKeyhole />
            <AlertTitle>Vehicle registry is locked</AlertTitle>
            <AlertDescription>
              Bangladesh Police must approve the VTS provider before linked customer vehicles can
              be viewed or managed.
            </AlertDescription>
          </Alert>
          <Card>
            <CardContent className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                <CarFront className="size-8" aria-hidden="true" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold">Provider approval required</h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Current application status: {statusLabel(application.status)}. Vehicle access will
                unlock automatically after approval.
              </p>
              <Button asChild className="mt-6 bg-emerald-800 text-white hover:bg-emerald-900">
                <Link href="/provider/dashboard">Return to provider dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const params = await searchParams
  const search = firstValue(params.search)?.trim() || ""
  const requestedStatus = firstValue(params.status)?.trim() || ""
  const status = verificationStatuses.includes(
    requestedStatus as (typeof verificationStatuses)[number]
  )
    ? requestedStatus
    : ""
  const requestedGps = firstValue(params.gps)?.trim() || ""
  const gps = gpsStatuses.includes(requestedGps as (typeof gpsStatuses)[number])
    ? (requestedGps as "online" | "offline")
    : ""
  const requestedTracking = firstValue(params.tracking)?.trim() || ""
  const tracking = trackingStatuses.includes(
    requestedTracking as (typeof trackingStatuses)[number]
  )
    ? requestedTracking
    : ""
  const cursor = firstValue(params.cursor) || ""

  let vehicles: ProviderVehiclePage | null = null
  let loadError: string | null = null
  try {
    vehicles = await getProviderVehicles({
      limit: PAGE_SIZE,
      search,
      status,
      gps,
      tracking,
      cursor,
    })
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "The provider vehicle registry is unavailable."
  }

  if (!vehicles) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load provider vehicles</AlertTitle>
            <AlertDescription>{loadError || "Vehicle data is unavailable."}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  const hasNextPage = Boolean(vehicles.next_cursor)
  const hasFilters = Boolean(search || status || (trackingUiEnabled && (gps || tracking)))
  const filters = { search, status, gps, tracking }
  const canManage = userHasAnyRole(user, vehicleManageRoles)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                Provider vehicle operations
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                Vehicle registry
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                Search compact records, open full vehicle details, review police notes, and correct
                draft or changes-requested registrations within active owner links.
              </p>
            </div>
            {canManage ? (
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                <Link href="/provider/vehicles/register">
                  <Plus /> Register vehicle
                </Link>
              </Button>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Linked vehicles", value: vehicles.stats.total, icon: CarFront },
            { label: "Verified vehicles", value: vehicles.stats.verified, icon: Gauge },
            ...(trackingUiEnabled
              ? [
                  { label: "GPS online", value: vehicles.stats.online, icon: RadioTower },
                  { label: "Active tracking", value: vehicles.stats.active_tracking, icon: MapPin },
                ]
              : []),
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-3 text-3xl font-semibold">{value}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <Icon aria-hidden="true" className="size-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <CardTitle>Provider vehicle portfolio</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {vehicles.total} matching vehicle record{vehicles.total === 1 ? "" : "s"} within
                  active provider-owner links.
                </p>
              </div>
              <Badge variant="secondary">Full details available</Badge>
            </div>

            <form
              className="mt-4 grid gap-3 xl:grid-cols-[minmax(260px,1fr)_210px_auto_auto]"
              method="get"
            >
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="pl-9"
                  defaultValue={search}
                  name="search"
                  placeholder="Registration, chassis, engine, brand, or model"
                />
              </div>
              <select
                aria-label="Verification status"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                defaultValue={status}
                name="status"
              >
                <option value="">All verification statuses</option>
                {verificationStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
              {trackingUiEnabled ? (
                <>
                  <select
                    aria-label="GPS status"
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    defaultValue={gps}
                    name="gps"
                  >
                    <option value="">All GPS statuses</option>
                    <option value="online">GPS online</option>
                    <option value="offline">GPS offline</option>
                  </select>
                  <select
                    aria-label="Tracking status"
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    defaultValue={tracking}
                    name="tracking"
                  >
                    <option value="">All tracking statuses</option>
                    {trackingStatuses.map((value) => (
                      <option key={value} value={value}>
                        {statusLabel(value)}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <Button type="submit">Apply</Button>
              {hasFilters ? (
                <Button asChild type="button" variant="outline">
                  <Link href="/provider/vehicles">Clear</Link>
                </Button>
              ) : null}
            </form>
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            {vehicles.items.length ? (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Vehicle name</th>
                      <th className="px-4 py-3 font-medium">Owner</th>
                      <th className="px-4 py-3 font-medium">Registration no.</th>
                      <th className="px-4 py-3 font-medium">Vehicle type</th>
                      <th className="px-4 py-3 font-medium">Verification</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {vehicles.items.map((vehicle) => (
                      <tr key={vehicle.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/provider/vehicles/${vehicle.id}`}
                            className="block max-w-56 truncate font-semibold hover:text-emerald-800 hover:underline"
                          >
                            {vehicle.registration_number_display || vehicle.registration_number}
                          </Link>
                          <p className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">
                            {[vehicle.brand, vehicle.model].filter(Boolean).join(" · ") || "Imported vehicle"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="max-w-48 truncate font-medium">{vehicle.owner.owner_name}</p>
                          <p className="mt-0.5 max-w-48 truncate text-xs text-muted-foreground">
                            {vehicle.owner.owner_code || "Owner code pending"}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {vehicle.registration_number.startsWith("GOMAX-")
                            ? "To be updated"
                            : vehicle.registration_number}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{vehicle.vehicle_type}</td>
                        <td className="px-4 py-3"><StatusBadge status={vehicle.verification_status} /></td>
                        <td className="px-4 py-3"><Badge variant="outline">{statusLabel(vehicle.status)}</Badge></td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/provider/vehicles/${vehicle.id}`}>
                              <Eye /> View
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 px-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <CarFront aria-hidden="true" className="size-7" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">
                  {hasFilters ? "No matching vehicles" : "No linked vehicles"}
                </h2>
                <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                  {hasFilters
                    ? "Change or clear the filters to view other vehicle records."
                    : "Vehicles appear here after an owner-provider link is active and a vehicle has been registered."}
                </p>
                {!hasFilters && canManage ? (
                  <Button asChild className="mt-5 bg-emerald-800 text-white hover:bg-emerald-900">
                    <Link href="/provider/vehicles/register">
                      <Plus /> Register first vehicle
                    </Link>
                  </Button>
                ) : null}
              </div>
            )}

            {vehicles.total > 0 ? (
              <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t pt-5 sm:flex-row">
                <p className="text-sm text-muted-foreground">
                  Showing {vehicles.items.length} record
                  {vehicles.items.length === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <Button asChild={hasNextPage} disabled={!hasNextPage} variant="outline">
                    {hasNextPage ? (
                      <Link href={pageHref(vehicles.next_cursor || "", filters)}>
                        Next <ChevronRight aria-hidden="true" />
                      </Link>
                    ) : (
                      <span>
                        Next <ChevronRight aria-hidden="true" />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
