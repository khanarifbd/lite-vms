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
  page: number,
  filters: { search: string; status: string; gps: string; tracking: string }
) {
  const params = new URLSearchParams()
  if (page > 1) params.set("page", String(page))
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
  const parsedPage = Number.parseInt(firstValue(params.page) || "1", 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  let vehicles: ProviderVehiclePage | null = null
  let loadError: string | null = null
  try {
    vehicles = await getProviderVehicles({
      page,
      limit: PAGE_SIZE,
      search,
      status,
      gps,
      tracking,
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

  const currentPage = Math.floor(vehicles.offset / vehicles.limit) + 1
  const pageCount = Math.max(1, Math.ceil(vehicles.total / vehicles.limit))
  const hasPreviousPage = vehicles.offset > 0
  const hasNextPage = vehicles.offset + vehicles.items.length < vehicles.total
  const hasFilters = Boolean(search || status || gps || tracking)
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
            { label: "GPS online", value: vehicles.stats.online, icon: RadioTower },
            { label: "Active tracking", value: vehicles.stats.active_tracking, icon: MapPin },
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
              className="mt-4 grid gap-3 xl:grid-cols-[minmax(260px,1fr)_210px_160px_220px_auto_auto]"
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
              <div className="grid gap-4 lg:grid-cols-2">
                {vehicles.items.map((vehicle) => (
                  <article key={vehicle.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                          <CarFront aria-hidden="true" className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/provider/vehicles/${vehicle.id}`}
                            className="block truncate text-lg font-semibold hover:text-emerald-800 hover:underline"
                          >
                            {vehicle.registration_number_display || vehicle.registration_number}
                          </Link>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {[vehicle.brand, vehicle.model, vehicle.vehicle_type]
                              .filter(Boolean)
                              .join(" · ") || "Vehicle details pending"}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={vehicle.verification_status} />
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">Vehicle owner</p>
                        <p className="mt-1 truncate font-medium">{vehicle.owner.owner_name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {vehicle.owner.owner_code || "Owner code pending"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">GPS status</p>
                        <p className="mt-1 flex items-center gap-2 font-medium">
                          <span
                            className={`size-2 rounded-full ${vehicle.gps_online ? "bg-emerald-500" : "bg-slate-300"}`}
                          />
                          {vehicle.gps_online ? "Online" : "Offline"}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 aria-hidden="true" className="size-3" />
                          {formatDate(vehicle.tracking_last_seen_at)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">Tracking provider</p>
                        <p className="mt-1 truncate font-medium">
                          {vehicle.tracking_provider_name || "Not connected"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">Current driver</p>
                        <p className="mt-1 flex items-center gap-1.5 truncate font-medium">
                          <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
                          {vehicle.current_driver_name || "Not assigned"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {statusLabel(vehicle.status)}
                        </Badge>
                        <Badge variant="outline">
                          Tracking {statusLabel(vehicle.tracking_assignment_status || "not_assigned")}
                        </Badge>
                        {vehicle.latest_speed_kph !== null ? (
                          <Badge variant="secondary">
                            Latest speed {Math.round(vehicle.latest_speed_kph)} km/h
                          </Badge>
                        ) : null}
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/provider/vehicles/${vehicle.id}`}>
                          <Eye /> View details
                        </Link>
                      </Button>
                    </div>
                  </article>
                ))}
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
                  Page {currentPage} of {pageCount} · showing {vehicles.items.length} record
                  {vehicles.items.length === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <Button asChild={hasPreviousPage} disabled={!hasPreviousPage} variant="outline">
                    {hasPreviousPage ? (
                      <Link href={pageHref(currentPage - 1, filters)}>
                        <ChevronLeft aria-hidden="true" /> Previous
                      </Link>
                    ) : (
                      <span>
                        <ChevronLeft aria-hidden="true" /> Previous
                      </span>
                    )}
                  </Button>
                  <Button asChild={hasNextPage} disabled={!hasNextPage} variant="outline">
                    {hasNextPage ? (
                      <Link href={pageHref(currentPage + 1, filters)}>
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
