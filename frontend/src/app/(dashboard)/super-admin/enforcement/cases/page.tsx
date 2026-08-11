import {
  Building2,
  CalendarClock,
  CarFront,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gauge,
  RadioTower,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  getPaginatedEnforcementCases,
  type EnforcementCaseDirection,
} from "@/features/super-admin/enforcement-case-pagination"
import type { ViolationReviewCandidate } from "@/features/super-admin/violation-review-types"

export const dynamic = "force-dynamic"

const PAGE_SIZES = [10, 20, 50, 100] as const
const STATUS_OPTIONS = [
  { value: "all", label: "All cases" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const

type CasesSearchParams = Promise<{
  cursor?: string | string[]
  direction?: string | string[]
  limit?: string | string[]
  page?: string | string[]
  status?: string | string[]
}>

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function label(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "—"
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—"
}

function evidenceValue(candidate: ViolationReviewCandidate | null, key: string) {
  const value = candidate?.evidence?.[key]
  return typeof value === "string" || typeof value === "number" ? value : null
}

function vehicleName(candidate: ViolationReviewCandidate | null) {
  const vehicle = candidate?.vehicle_profile
  return vehicle?.registration_number_display || vehicle?.registration_number || "Vehicle unavailable"
}

function buildPaginationHref({
  cursor,
  direction,
  limit,
  page,
  status,
}: {
  cursor: string
  direction: EnforcementCaseDirection
  limit: number
  page: number
  status: string
}) {
  const search = new URLSearchParams({
    cursor,
    direction,
    limit: String(limit),
    page: String(page),
    status,
  })
  return `?${search.toString()}`
}

function buildResetHref({ limit, status }: { limit: number; status: string }) {
  return `?${new URLSearchParams({ limit: String(limit), status, page: "1" }).toString()}`
}

export default async function EnforcementCasesPage({
  searchParams,
}: {
  searchParams: CasesSearchParams
}) {
  const params = await searchParams
  const requestedLimit = Number(firstValue(params.limit))
  const limit = PAGE_SIZES.includes(requestedLimit as (typeof PAGE_SIZES)[number])
    ? requestedLimit
    : 20
  const cursor = firstValue(params.cursor)
  const direction: EnforcementCaseDirection =
    firstValue(params.direction) === "previous" ? "previous" : "next"
  const requestedPage = Number(firstValue(params.page))
  const pageNumber = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const requestedStatus = firstValue(params.status) || "all"
  const status = STATUS_OPTIONS.some((option) => option.value === requestedStatus)
    ? requestedStatus
    : "all"

  const casesPage = await getPaginatedEnforcementCases({
    status: status === "all" ? undefined : status,
    limit,
    cursor,
    direction,
  })

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-700">
            <ShieldCheck className="size-5" />
            <span className="text-sm font-semibold">Traffic enforcement</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Official Cases</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Approved violation candidates become official cases assigned to the responsible police
            organization. Cursor pagination keeps this national case register fast at scale.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  asChild
                  size="sm"
                  variant={status === option.value ? "default" : "outline"}
                >
                  <Link href={buildResetHref({ limit, status: option.value })}>{option.label}</Link>
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Rows per page</span>
              {PAGE_SIZES.map((size) => (
                <Button
                  key={size}
                  asChild
                  size="sm"
                  variant={limit === size ? "default" : "outline"}
                >
                  <Link href={buildResetHref({ limit: size, status })}>{size}</Link>
                </Button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Page <span className="font-semibold text-foreground">{pageNumber}</span>
            <span className="mx-2">·</span>
            Showing <span className="font-semibold text-foreground">{casesPage.items.length}</span>{" "}
            cases
          </p>
        </div>

        <div className="space-y-4">
          {casesPage.items.map((item) => {
            const candidate = item.candidate
            const vehicle = candidate?.vehicle_profile
            const owner = candidate?.owner_profile
            const provider = candidate?.provider_profile
            const device = candidate?.device_profile
            const ruleName = evidenceValue(candidate, "rule_name")
            const policyName = evidenceValue(candidate, "policy_name")

            return (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold">{item.case_number}</p>
                          <Badge variant="outline" className="capitalize">
                            {label(item.status)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            <CarFront className="size-4 text-emerald-700" />
                            {vehicleName(candidate)}
                          </span>
                          <span>·</span>
                          <span className="capitalize">{label(candidate?.violation_type)}</span>
                        </div>
                      </div>

                      <div className="text-right text-xs text-muted-foreground">
                        <p className="flex items-center justify-end gap-1.5">
                          <CalendarClock className="size-3.5" /> Opened {dateTime(item.opened_at)}
                        </p>
                        <p className="mt-1">
                          {candidate?.responsible_organization_name || `Organization ${item.organization_id}`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Gauge className="size-3.5" /> Violation evidence
                        </div>
                        <p className="mt-1 font-semibold">
                          {candidate?.detected_value ?? "—"} / {candidate?.allowed_value ?? "—"} km/h
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Detected {dateTime(candidate?.detected_at)}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <UserRound className="size-3.5" /> Vehicle owner
                        </div>
                        <p className="mt-1 font-semibold">{owner?.name || "Unavailable"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {owner?.owner_code || "No owner code"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Building2 className="size-3.5" /> VTS provider
                        </div>
                        <p className="mt-1 font-semibold">
                          {provider?.trade_name || provider?.name || "Unavailable"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {provider?.code || "No provider code"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <RadioTower className="size-3.5" /> Incident device
                        </div>
                        <p className="mt-1 font-semibold">IMEI {device?.imei || "—"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {device?.protocol || "No protocol"} · {device?.source_code || "No source"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50/60 px-4 py-3">
                      <div className="min-w-0 text-sm">
                        <p>
                          <span className="font-medium">Rule:</span> {ruleName ?? "—"}
                          <span className="mx-2 text-muted-foreground">·</span>
                          <span className="font-medium">Policy:</span> {policyName ?? "—"}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Review note: {item.notes || "No review note recorded"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {vehicle ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/super-admin/vehicles/${vehicle.id}`}>
                              Vehicle <ExternalLink />
                            </Link>
                          </Button>
                        ) : null}
                        {owner ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/super-admin/owners/${owner.id}`}>
                              Owner <ExternalLink />
                            </Link>
                          </Button>
                        ) : null}
                        {provider ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/super-admin/providers/${provider.id}`}>
                              Provider <ExternalLink />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {!casesPage.items.length ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No official cases match the selected status.
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Adjacent pages are loaded by cursor without scanning or counting the complete case table.
          </p>
          <div className="flex items-center gap-2">
            {casesPage.has_previous && casesPage.previous_cursor ? (
              <Button asChild variant="outline">
                <Link
                  href={buildPaginationHref({
                    cursor: casesPage.previous_cursor,
                    direction: "previous",
                    limit,
                    page: Math.max(1, pageNumber - 1),
                    status,
                  })}
                >
                  <ChevronLeft /> Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <ChevronLeft /> Previous
              </Button>
            )}

            {casesPage.has_next && casesPage.next_cursor ? (
              <Button asChild variant="outline">
                <Link
                  href={buildPaginationHref({
                    cursor: casesPage.next_cursor,
                    direction: "next",
                    limit,
                    page: pageNumber + 1,
                    status,
                  })}
                >
                  Next <ChevronRight />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Next <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
