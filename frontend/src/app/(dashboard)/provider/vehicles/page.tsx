import {
  CarFront,
  ChevronLeft,
  ChevronRight,
  Eye,
  LockKeyhole,
  Plus,
  Search,
  ShieldAlert,
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
import { getActiveProviderOwners } from "@/lib/provider/owner-server"
import { getMyProviderApplication } from "@/lib/provider/server"
import { getProviderVehicles } from "@/lib/provider/vehicle-server"

export const dynamic = "force-dynamic"

const DEFAULT_PAGE_SIZE = 25
const pageSizes = [10, 25, 50, 100] as const
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

type SearchValue = string | string[] | undefined

type ProviderVehiclesPageProps = {
  searchParams: Promise<{
    page?: SearchValue
    search?: SearchValue
    status?: SearchValue
    gps?: SearchValue
    tracking?: SearchValue
    cursor?: SearchValue
    limit?: SearchValue
    owner?: SearchValue
    documents?: SearchValue
  }>
}

type PaginationItem = number | "ellipsis"

type VehicleFilters = {
  search: string
  status: string
  gps: string
  tracking: string
  limit: number
  ownerId: string
  documentStatus: string
}

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value
}

function statusLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function documentStatusLabel(vehicle: ProviderVehiclePage["items"][number]) {
  if (vehicle.document_status === "required") {
    return `${vehicle.missing_documents.length} document${vehicle.missing_documents.length === 1 ? "" : "s"} required`
  }
  if (vehicle.document_days_remaining === null) return "Not available"
  if (vehicle.document_days_remaining < 0) {
    return `Expired ${Math.abs(vehicle.document_days_remaining)} days ago`
  }
  return `${vehicle.document_days_remaining} days left`
}

function shortDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date)
}

function pageHref(page: number, filters: VehicleFilters) {
  const params = new URLSearchParams()
  if (page > 1) params.set("page", String(page))
  if (filters.limit !== DEFAULT_PAGE_SIZE) params.set("limit", String(filters.limit))
  if (filters.ownerId) params.set("owner", filters.ownerId)
  if (filters.documentStatus) params.set("documents", filters.documentStatus)
  if (filters.search) params.set("search", filters.search)
  if (filters.status) params.set("status", filters.status)
  if (filters.gps) params.set("gps", filters.gps)
  if (filters.tracking) params.set("tracking", filters.tracking)
  const query = params.toString()
  return query ? `/provider/vehicles?${query}` : "/provider/vehicles"
}

function paginationItems(currentPage: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  const items: PaginationItem[] = [1]
  const start = Math.max(2, currentPage - 2)
  const end = Math.min(pageCount - 1, currentPage + 2)

  if (start > 2) items.push("ellipsis")
  for (let page = start; page <= end; page += 1) items.push(page)
  if (end < pageCount - 1) items.push("ellipsis")
  items.push(pageCount)

  return items
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
  const requestedLimit = Number(firstValue(params.limit))
  const limit = pageSizes.includes(requestedLimit as (typeof pageSizes)[number])
    ? requestedLimit
    : DEFAULT_PAGE_SIZE
  const requestedPage = Number(firstValue(params.page))
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  let ownerOptions: Awaited<ReturnType<typeof getActiveProviderOwners>>["items"] = []
  try {
    ownerOptions = (await getActiveProviderOwners()).items.filter(
      (item) => item.link.status === "active"
    )
  } catch {
    // The vehicle registry remains available when the optional owner filter cannot load.
  }

  const requestedOwnerId = firstValue(params.owner) || ""
  const ownerId = ownerOptions.some((item) => item.owner.id === requestedOwnerId)
    ? requestedOwnerId
    : ""
  const requestedDocumentStatus = firstValue(params.documents) || ""
  const documentStatus: "" | "required" | "expired" | "expiring" = [
    "required",
    "expired",
    "expiring",
  ].includes(requestedDocumentStatus)
    ? (requestedDocumentStatus as "required" | "expired" | "expiring")
    : ""

  const filters: VehicleFilters = {
    search,
    status,
    gps,
    tracking,
    limit,
    ownerId,
    documentStatus,
  }

  let vehicles: ProviderVehiclePage | null = null
  let loadError: string | null = null
  try {
    vehicles = await getProviderVehicles({
      page,
      limit,
      search,
      status,
      gps,
      tracking,
      ownerId,
      documentStatus,
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

  const pageCount = Math.max(1, Math.ceil(vehicles.total / limit))
  if (page > pageCount) redirect(pageHref(pageCount, filters))

  const currentPage = Math.floor(vehicles.offset / vehicles.limit) + 1
  const hasPreviousPage = currentPage > 1
  const hasNextPage = currentPage < pageCount
  const visiblePaginationItems = paginationItems(currentPage, pageCount)
  const firstRecord = vehicles.total > 0 ? vehicles.offset + 1 : 0
  const lastRecord = Math.min(vehicles.total, vehicles.offset + vehicles.items.length)
  const hasFilters = Boolean(
    search || status || ownerId || documentStatus || (trackingUiEnabled && (gps || tracking))
  )
  const canManage = userHasAnyRole(user, vehicleManageRoles)

  return (
    <div className="px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
      <div className="mx-auto max-w-7xl">
        <Card>
          <CardHeader className="space-y-0 border-b px-4 py-4 sm:px-5">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <CardTitle>Vehicle portfolio</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {vehicles.total} matching vehicle record{vehicles.total === 1 ? "" : "s"} within
                  active provider-owner links.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{vehicles.stats.verified} verified</Badge>
                {canManage ? (
                  <Button asChild size="sm">
                    <Link href="/provider/vehicles/register">
                      <Plus /> Register vehicle
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>

            <form
              className="mt-3 grid gap-2 xl:grid-cols-[minmax(250px,1fr)_205px_215px_145px_155px_auto_auto]"
              method="get"
            >
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="h-9 pl-9"
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
                aria-label="Vehicle owner"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                defaultValue={ownerId}
                name="owner"
              >
                <option value="">All vehicle owners</option>
                {ownerOptions.map((item) => (
                  <option key={item.owner.id} value={item.owner.id}>
                    {item.owner.owner_name} · {item.owner.owner_code}
                  </option>
                ))}
              </select>
              <select
                aria-label="Vehicles per page"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                defaultValue={limit}
                name="limit"
              >
                {pageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
              <select
                aria-label="Document compliance"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                defaultValue={documentStatus}
                name="documents"
              >
                <option value="">All documents</option>
                <option value="required">Documents required</option>
                <option value="expired">Any document expired</option>
                <option value="expiring">Expiring within 30 days</option>
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
              <Button className="h-9" type="submit">
                Apply
              </Button>
              {hasFilters ? (
                <Button asChild className="h-9" type="button" variant="outline">
                  <Link href="/provider/vehicles">Clear</Link>
                </Button>
              ) : null}
            </form>

            {vehicles.total > 0 ? (
              <div className="mt-3 flex flex-col gap-2 border-t pt-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Showing <span className="font-medium text-foreground">{firstRecord}–{lastRecord}</span> of{" "}
                  <span className="font-medium text-foreground">{vehicles.total}</span>
                  <span className="mx-2 text-slate-300">|</span>
                  Page <span className="font-medium text-foreground">{currentPage}</span> of{" "}
                  <span className="font-medium text-foreground">{pageCount}</span>
                </p>
                <nav aria-label="Vehicle pagination" className="flex flex-wrap items-center gap-1">
                  {hasPreviousPage ? (
                    <Button asChild className="h-8 px-2" size="sm" variant="outline">
                      <Link href={pageHref(currentPage - 1, filters)} aria-label="Previous page">
                        <ChevronLeft aria-hidden="true" className="size-4" />
                        <span className="hidden sm:inline">Previous</span>
                      </Link>
                    </Button>
                  ) : (
                    <Button className="h-8 px-2" disabled size="sm" variant="outline">
                      <ChevronLeft aria-hidden="true" className="size-4" />
                      <span className="hidden sm:inline">Previous</span>
                    </Button>
                  )}

                  {visiblePaginationItems.map((item, index) =>
                    item === "ellipsis" ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="flex h-8 min-w-7 items-center justify-center px-1 text-sm text-muted-foreground"
                      >
                        …
                      </span>
                    ) : item === currentPage ? (
                      <Button
                        key={item}
                        aria-current="page"
                        className="h-8 min-w-8 px-2"
                        disabled
                        size="sm"
                      >
                        {item}
                      </Button>
                    ) : (
                      <Button
                        key={item}
                        asChild
                        className="h-8 min-w-8 px-2"
                        size="sm"
                        variant="outline"
                      >
                        <Link href={pageHref(item, filters)}>{item}</Link>
                      </Button>
                    )
                  )}

                  {hasNextPage ? (
                    <Button asChild className="h-8 px-2" size="sm" variant="outline">
                      <Link href={pageHref(currentPage + 1, filters)} aria-label="Next page">
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight aria-hidden="true" className="size-4" />
                      </Link>
                    </Button>
                  ) : (
                    <Button className="h-8 px-2" disabled size="sm" variant="outline">
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Button>
                  )}
                </nav>
              </div>
            ) : null}
          </CardHeader>

          <CardContent className="p-3 sm:p-4">
            {vehicles.items.length ? (
              <div className="max-h-[60vh] overflow-auto rounded-xl border xl:max-h-[calc(100vh-360px)]">
                <table className="w-full min-w-[1120px] border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Vehicle name</th>
                      <th className="px-3 py-2 font-medium">Owner</th>
                      <th className="px-3 py-2 font-medium">Registration no.</th>
                      <th className="px-3 py-2 font-medium">Vehicle type</th>
                      <th className="px-3 py-2 font-medium">Verification</th>
                      <th className="px-3 py-2 font-medium">Documents</th>
                      <th className="px-3 py-2 font-medium">Certificate</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {vehicles.items.map((vehicle) => (
                      <tr key={vehicle.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-3 py-2 align-middle">
                          <Link
                            href={`/provider/vehicles/${vehicle.id}`}
                            className="block max-w-52 truncate text-[13px] font-semibold leading-4 hover:text-emerald-800 hover:underline"
                          >
                            {vehicle.registration_number_display || vehicle.registration_number}
                          </Link>
                          <p className="max-w-52 truncate text-[11px] leading-4 text-muted-foreground">
                            {[vehicle.brand, vehicle.model].filter(Boolean).join(" · ") || "Imported vehicle"}
                          </p>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <p className="max-w-48 truncate text-[13px] font-medium leading-4">
                            {vehicle.owner.owner_name}
                          </p>
                          <p className="max-w-48 truncate text-[11px] leading-4 text-muted-foreground">
                            {vehicle.owner.owner_code || "Owner code pending"}
                          </p>
                        </td>
                        <td className="px-3 py-2 align-middle font-medium leading-4 text-slate-700">
                          {vehicle.registration_number.startsWith("GOMAX-")
                            ? "To be updated"
                            : vehicle.registration_number}
                        </td>
                        <td className="px-3 py-2 align-middle text-muted-foreground">
                          {vehicle.vehicle_type}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <StatusBadge status={vehicle.verification_status} />
                        </td>
                        <td className="px-3 py-2 align-middle leading-4">
                          <p
                            className={
                              vehicle.document_status === "required" ||
                              vehicle.document_status === "expired"
                                ? "font-medium text-rose-700"
                                : vehicle.document_status === "expiring"
                                  ? "font-medium text-amber-700"
                                  : "font-medium text-emerald-700"
                            }
                          >
                            {documentStatusLabel(vehicle)}
                          </p>
                          {vehicle.document_status !== "valid" ? (
                            <Link
                              href={`/provider/vehicles/${vehicle.id}/documents`}
                              className="text-[11px] font-medium text-emerald-800 hover:underline"
                            >
                              Add documents
                            </Link>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-middle leading-4">
                          {vehicle.certificate_number ? (
                            <>
                              <p className="font-medium text-emerald-800">
                                Issued {shortDate(vehicle.certificate_issued_at)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Expires {shortDate(vehicle.certificate_expires_at)}
                              </p>
                            </>
                          ) : (
                            <Link
                              href={`/provider/vehicles/${vehicle.id}/certificate`}
                              className="text-[11px] font-medium text-emerald-800 hover:underline"
                            >
                              Not issued
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <Badge className="h-6 px-2 text-[11px]" variant="outline">
                            {statusLabel(vehicle.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right align-middle">
                          <Button asChild className="h-7 px-2 text-xs" size="sm" variant="outline">
                            <Link href={`/provider/vehicles/${vehicle.id}`}>
                              <Eye className="size-3.5" /> View
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
