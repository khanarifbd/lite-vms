import {
  ArrowRight,
  CarFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Gauge,
  MapPin,
  Plus,
  RadioTower,
  Search,
  ShieldAlert,
} from "lucide-react"
import Link from "next/link"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { OwnerVehiclePage } from "@/features/owner/types"
import { getMyVehicles } from "@/lib/owner/server"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 12
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

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

type SearchValue = string | string[] | undefined

type Props = {
  searchParams: Promise<{
    page?: SearchValue
    search?: SearchValue
    status?: SearchValue
    registration?: SearchValue
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

function pageHref(page: number, search: string, status: string) {
  const params = new URLSearchParams()
  if (page > 1) params.set("page", String(page))
  if (search) params.set("search", search)
  if (status) params.set("status", status)
  const query = params.toString()
  return query ? `/owner/vehicles?${query}` : "/owner/vehicles"
}

export default async function OwnerVehiclesPage({ searchParams }: Props) {
  const params = await searchParams
  const search = firstValue(params.search)?.trim() || ""
  const requestedStatus = firstValue(params.status)?.trim() || ""
  const registrationResult = firstValue(params.registration)?.trim() || ""
  const status = verificationStatuses.includes(
    requestedStatus as (typeof verificationStatuses)[number]
  )
    ? requestedStatus
    : ""
  const parsedPage = Number.parseInt(firstValue(params.page) || "1", 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  let vehicles: OwnerVehiclePage | null = null
  let loadError: string | null = null

  try {
    vehicles = await getMyVehicles({ page, limit: PAGE_SIZE, search, status })
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The vehicle registry is unavailable."
  }

  if (!vehicles) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load owner vehicles</AlertTitle>
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
  const hasFilters = Boolean(search || status)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {registrationResult === "submitted" ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
            <CheckCircle2 />
            <AlertTitle>Vehicle submitted for police review</AlertTitle>
            <AlertDescription>
              The registration now appears in your workspace and the Bangladesh Police review queue.
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                National vehicle registry
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">My vehicles</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                Register and manage your vehicles, documents, police corrections, provider relationship, GPS connectivity, and live status.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/owner/tracking"><MapPin /> Live tracking</Link>
              </Button>
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                <Link href="/owner/vehicles/register"><Plus /> Add vehicle</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Registered vehicles", value: vehicles.stats.total, icon: CarFront },
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
                <CardTitle>Vehicle portfolio</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {vehicles.total} matching vehicle record{vehicles.total === 1 ? "" : "s"} within your owner scope.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/owner/vehicles/register"><Plus /> Register another vehicle</Link>
              </Button>
            </div>

            <form className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]" method="get">
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
                  <option key={value} value={value}>{statusLabel(value)}</option>
                ))}
              </select>
              <Button type="submit">Apply filters</Button>
              {hasFilters ? (
                <Button asChild type="button" variant="outline">
                  <Link href="/owner/vehicles">Clear</Link>
                </Button>
              ) : null}
            </form>
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            {vehicles.items.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {vehicles.items.map((vehicle) => {
                  const vehicleHref = `/owner/vehicles/${vehicle.id}`
                  const documentsHref = `${vehicleHref}/documents`
                  const trackingHref = `${vehicleHref}/tracking`
                  return (
                    <article
                      key={vehicle.id}
                      className="rounded-2xl border bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                            <CarFront aria-hidden="true" className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <Link className="truncate text-lg font-semibold hover:text-emerald-800" href={vehicleHref}>
                              {vehicle.registration_number_display || vehicle.registration_number}
                            </Link>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {[vehicle.brand, vehicle.model, vehicle.vehicle_type].filter(Boolean).join(" · ") || "Vehicle details pending"}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={vehicle.verification_status} />
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                          <p className="text-xs text-muted-foreground">GPS status</p>
                          <p className="mt-1 flex items-center gap-2 font-medium">
                            <span className={`size-2 rounded-full ${vehicle.gps_online ? "bg-emerald-500" : "bg-slate-300"}`} />
                            {vehicle.gps_online ? "Online" : "Offline"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                          <p className="text-xs text-muted-foreground">Last tracking record</p>
                          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                            <Clock3 aria-hidden="true" className="size-3.5" />
                            {formatDate(vehicle.tracking_last_seen_at)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                          <p className="text-xs text-muted-foreground">VTS provider</p>
                          <p className="mt-1 font-medium">{vehicle.tracking_provider_name || "Not connected"}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                          <p className="text-xs text-muted-foreground">Latest speed</p>
                          <p className="mt-1 font-medium">
                            {vehicle.latest_speed_kph !== null ? `${Math.round(vehicle.latest_speed_kph)} km/h` : "Not available"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                        <Badge variant="outline" className="capitalize">{vehicle.status.replaceAll("_", " ")}</Badge>
                        <Badge variant="outline" className="capitalize">
                          Tracking {vehicle.tracking_assignment_status?.replaceAll("_", " ") || "not assigned"}
                        </Badge>
                        <div className="ml-auto flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={documentsHref}><FileText /> Documents</Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={trackingHref}><RadioTower /> GPS</Link>
                          </Button>
                          <Button asChild size="sm" className="bg-emerald-800 text-white hover:bg-emerald-900">
                            <Link href={vehicleHref}>Open <ArrowRight /></Link>
                          </Button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 px-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <CarFront aria-hidden="true" className="size-7" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">{hasFilters ? "No matching vehicles" : "No vehicles registered"}</h2>
                <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                  {hasFilters
                    ? "Change or clear the current filters to view other vehicle records."
                    : "Add your first vehicle and submit it for Bangladesh Police verification."}
                </p>
                {!hasFilters ? (
                  <Button asChild className="mt-5 bg-emerald-800 text-white hover:bg-emerald-900">
                    <Link href="/owner/vehicles/register"><Plus /> Add first vehicle</Link>
                  </Button>
                ) : null}
              </div>
            )}

            {vehicles.total > 0 ? (
              <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t pt-5 sm:flex-row">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {pageCount} · showing {vehicles.items.length} record{vehicles.items.length === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <Button asChild={hasPreviousPage} disabled={!hasPreviousPage} variant="outline">
                    {hasPreviousPage ? (
                      <Link href={pageHref(currentPage - 1, search, status)}><ChevronLeft /> Previous</Link>
                    ) : (
                      <span><ChevronLeft /> Previous</span>
                    )}
                  </Button>
                  <Button asChild={hasNextPage} disabled={!hasNextPage} variant="outline">
                    {hasNextPage ? (
                      <Link href={pageHref(currentPage + 1, search, status)}>Next <ChevronRight /></Link>
                    ) : (
                      <span>Next <ChevronRight /></span>
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
