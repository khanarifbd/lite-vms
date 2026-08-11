import { CarFront, ChevronLeft, ChevronRight, Search } from "lucide-react"
import Link from "next/link"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  getAdminVehicles,
  type AdminVehicle,
} from "@/features/super-admin/vehicle-review"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 20
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000
const statuses = [
  "draft",
  "pending_verification",
  "under_review",
  "verified",
  "changes_requested",
  "rejected",
  "suspended",
  "decommissioned",
]

type SearchValue = string | string[] | undefined
type Props = {
  searchParams: Promise<{
    search?: SearchValue
    status?: SearchValue
    page?: SearchValue
  }>
}

type ComplianceDocumentType = "tax_token" | "fitness" | "route_permit"
type ComplianceTone = "missing" | "expired" | "warning" | "valid"

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value
}

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function pageHref(page: number, search: string, status: string) {
  const params = new URLSearchParams()
  if (page > 1) params.set("page", String(page))
  if (search) params.set("search", search)
  if (status) params.set("status", status)
  const query = params.toString()
  return query ? `/super-admin/vehicles?${query}` : "/super-admin/vehicles"
}

function dhakaTodayUtc() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day))
}

function dateOnlyToUtc(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function currentDocumentExpiry(
  vehicle: AdminVehicle,
  documentType: ComplianceDocumentType,
  fallback: string | null
) {
  const document = vehicle.documents.find(
    (item) =>
      item.document_type === documentType &&
      item.is_active &&
      (item.status === "valid" || item.status === "expired")
  )
  return document?.expires_at || fallback
}

function complianceState(expiresAt: string | null) {
  if (!expiresAt) {
    return {
      tone: "missing" as ComplianceTone,
      title: "Not recorded",
      detail: "No expiry date",
    }
  }

  const expiryUtc = dateOnlyToUtc(expiresAt)
  if (expiryUtc === null) {
    return {
      tone: "missing" as ComplianceTone,
      title: "Invalid date",
      detail: expiresAt,
    }
  }

  const days = Math.round((expiryUtc - dhakaTodayUtc()) / DAY_IN_MILLISECONDS)
  const formattedDate = new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(expiryUtc))

  if (days < 0) {
    const elapsed = Math.abs(days)
    return {
      tone: "expired" as ComplianceTone,
      title: `${elapsed}d expired`,
      detail: formattedDate,
    }
  }

  if (days === 0) {
    return {
      tone: "warning" as ComplianceTone,
      title: "Expires today",
      detail: formattedDate,
    }
  }

  return {
    tone: days <= 30 ? ("warning" as ComplianceTone) : ("valid" as ComplianceTone),
    title: `${days}d left`,
    detail: formattedDate,
  }
}

function ComplianceTableCell({ expiresAt }: { expiresAt: string | null }) {
  const state = complianceState(expiresAt)
  const toneClass = {
    missing: "border-slate-200 bg-slate-50 text-slate-600",
    expired: "border-rose-200 bg-rose-50 text-rose-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    valid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[state.tone]

  return (
    <div className="min-w-[108px]">
      <span
        className={`inline-flex max-w-full items-center rounded-md border px-2 py-1 text-[0.7rem] font-semibold leading-none ${toneClass}`}
      >
        {state.title}
      </span>
      <p className="mt-1 whitespace-nowrap text-[0.65rem] text-muted-foreground">
        {state.detail}
      </p>
    </div>
  )
}

export default async function SuperAdminVehiclesPage({ searchParams }: Props) {
  const query = await searchParams
  const search = first(query.search)?.trim() || ""
  const requestedStatus = first(query.status)?.trim() || ""
  const status = statuses.includes(requestedStatus) ? requestedStatus : ""
  const parsedPage = Number.parseInt(first(query.page) || "1", 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const data = await getAdminVehicles({
    search,
    status,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  })
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit))
  const hasPrevious = data.offset > 0
  const hasNext = data.offset + data.items.length < data.total

  return (
    <div className="px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-7 text-white shadow-xl sm:px-8">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative max-w-3xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              National vehicle verification
            </Badge>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              Vehicle review workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/75">
              Review vehicle identity, ownership and compliance readiness from one compact national
              registry.
            </p>
          </div>
        </section>

        <Card className="overflow-hidden">
          <CardHeader className="border-b px-4 py-4 sm:px-5">
            <div>
              <CardTitle className="text-base">National vehicle registry</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.total} matching vehicle records · {PAGE_SIZE} rows per page
              </p>
            </div>
            <form
              method="get"
              className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_230px_auto_auto]"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={search}
                  placeholder="Registration, chassis, engine, brand, or model"
                  className="h-9 pl-9 text-sm"
                />
              </div>
              <select
                name="status"
                defaultValue={status}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">All verification statuses</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm">
                Apply filters
              </Button>
              {search || status ? (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href="/super-admin/vehicles">Clear</Link>
                </Button>
              ) : null}
            </form>
          </CardHeader>

          <CardContent className="p-0">
            {data.items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] border-collapse text-left">
                  <thead className="bg-slate-50/95 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <tr className="border-b">
                      <th className="w-[230px] px-4 py-3">Vehicle</th>
                      <th className="w-[118px] px-3 py-3">Verification</th>
                      <th className="w-[190px] px-3 py-3">Owner</th>
                      <th className="w-[135px] px-3 py-3">Tax token</th>
                      <th className="w-[135px] px-3 py-3">Fitness</th>
                      <th className="w-[135px] px-3 py-3">Route permit</th>
                      <th className="w-[100px] px-3 py-3">Status</th>
                      <th className="w-[100px] px-3 py-3">GPS</th>
                      <th className="w-[110px] px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-white">
                    {data.items.map((vehicle) => {
                      const taxTokenExpiry = currentDocumentExpiry(
                        vehicle,
                        "tax_token",
                        vehicle.tax_token_expiry_date
                      )
                      const fitnessExpiry = currentDocumentExpiry(
                        vehicle,
                        "fitness",
                        vehicle.fitness_expiry_date
                      )
                      const routePermitExpiry = currentDocumentExpiry(
                        vehicle,
                        "route_permit",
                        vehicle.route_permit_expiry_date
                      )

                      return (
                        <tr
                          key={vehicle.id}
                          className="group transition-colors hover:bg-emerald-50/45"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                                <CarFront className="size-4" />
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/super-admin/vehicles/${vehicle.id}`}
                                  className="block max-w-[180px] truncate text-sm font-semibold text-slate-900 hover:text-emerald-800"
                                >
                                  {vehicle.registration_number_display ||
                                    vehicle.registration_number}
                                </Link>
                                <p className="mt-0.5 max-w-[180px] truncate text-[0.68rem] text-muted-foreground">
                                  {[vehicle.brand, vehicle.model, vehicle.vehicle_type]
                                    .filter(Boolean)
                                    .join(" · ") || "Vehicle details unavailable"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusBadge status={vehicle.verification_status} />
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="max-w-[165px] truncate text-xs font-semibold text-slate-800">
                              {vehicle.owner.owner_name}
                            </p>
                            <p className="mt-0.5 max-w-[165px] truncate text-[0.65rem] text-muted-foreground">
                              {vehicle.created_by_provider_name || "Owner submitted"}
                            </p>
                          </td>
                          <td className="px-3 py-2.5">
                            <ComplianceTableCell expiresAt={taxTokenExpiry} />
                          </td>
                          <td className="px-3 py-2.5">
                            <ComplianceTableCell expiresAt={fitnessExpiry} />
                          </td>
                          <td className="px-3 py-2.5">
                            <ComplianceTableCell expiresAt={routePermitExpiry} />
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className="whitespace-nowrap px-2 py-0.5 text-[0.67rem] font-medium">
                              {label(vehicle.status)}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${
                                vehicle.gps_online ? "text-emerald-700" : "text-slate-500"
                              }`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${
                                  vehicle.gps_online ? "bg-emerald-500" : "bg-slate-400"
                                }`}
                              />
                              {vehicle.gps_online ? "Online" : "Offline"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Button
                              asChild
                              size="sm"
                              className="h-8 bg-emerald-800 px-3 text-xs text-white hover:bg-emerald-900"
                            >
                              <Link href={`/super-admin/vehicles/${vehicle.id}`}>Open</Link>
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center bg-slate-50 text-center">
                <CarFront className="size-8 text-emerald-700" />
                <h2 className="mt-3 font-semibold">No vehicles found</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Change or clear the current filters.
                </p>
              </div>
            )}

            {data.total > 0 ? (
              <div className="flex flex-col items-center justify-between gap-3 border-t bg-slate-50/70 px-4 py-3 sm:flex-row">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {pageCount} · Showing {data.items.length} records
                </p>
                <div className="flex gap-2">
                  <Button
                    asChild={hasPrevious}
                    disabled={!hasPrevious}
                    size="sm"
                    variant="outline"
                  >
                    {hasPrevious ? (
                      <Link href={pageHref(page - 1, search, status)}>
                        <ChevronLeft /> Previous
                      </Link>
                    ) : (
                      <span>
                        <ChevronLeft /> Previous
                      </span>
                    )}
                  </Button>
                  <Button asChild={hasNext} disabled={!hasNext} size="sm" variant="outline">
                    {hasNext ? (
                      <Link href={pageHref(page + 1, search, status)}>
                        Next <ChevronRight />
                      </Link>
                    ) : (
                      <span>
                        Next <ChevronRight />
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
