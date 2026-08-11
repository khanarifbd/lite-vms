import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CarFront,
  Clock3,
  ExternalLink,
  FileClock,
  Filter,
  Search,
  ShieldAlert,
  SortAsc,
} from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  getApprovalQueuePage,
  getApprovalQueueSummary,
} from "@/features/approvals/data"
import type {
  ApprovalCursorDirection,
  ApprovalQueueState,
  ApprovalSortOrder,
  DocumentApprovalItem,
} from "@/features/approvals/types"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

type AttentionStatus = "expired" | "expiring_soon"
type DocumentTypeFilter =
  | "all"
  | "registration"
  | "fitness"
  | "tax_token"
  | "insurance"
  | "route_permit"
type DocumentPageState = ApprovalQueueState & {
  status: AttentionStatus
  documentType: DocumentTypeFilter
}
type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const pageSizes = [10, 20, 50, 100]
const documentTypeOptions: Array<{ value: DocumentTypeFilter; label: string }> = [
  { value: "all", label: "All documents" },
  { value: "registration", label: "Registration certificate" },
  { value: "fitness", label: "Fitness certificate" },
  { value: "tax_token", label: "Tax token" },
  { value: "insurance", label: "Insurance" },
  { value: "route_permit", label: "Route permit" },
]
const documentTypeValues = new Set<DocumentTypeFilter>(
  documentTypeOptions.map((option) => option.value)
)
const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function humanize(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "Not available"
}

function documentTypeLabel(value: DocumentTypeFilter) {
  return documentTypeOptions.find((option) => option.value === value)?.label || "All documents"
}

function formatDate(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

function expiryDistance(value: string | null, status: AttentionStatus) {
  if (!value) return "Expiry date unavailable"
  const expiry = new Date(`${value}T00:00:00`).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (Number.isNaN(expiry)) return "Expiry date unavailable"
  const days = Math.ceil(Math.abs(expiry - today.getTime()) / 86_400_000)
  if (status === "expired") return `${days} day${days === 1 ? "" : "s"} overdue`
  return `${days} day${days === 1 ? "" : "s"} remaining`
}

function documentHref(item: DocumentApprovalItem) {
  if (!item.storage_key) return null
  const params = new URLSearchParams({
    storageKey: item.storage_key,
    fileName: item.file_name || `${item.document_type}.pdf`,
    download: "0",
  })
  return `/api/documents?${params.toString()}`
}

function parseState(
  params: Record<string, string | string[] | undefined>
): DocumentPageState {
  const requestedStatus = first(params.status)
  const status: AttentionStatus = requestedStatus === "expiring_soon" ? "expiring_soon" : "expired"
  const requestedDocumentType = first(params.document_type) as DocumentTypeFilter | undefined
  const documentType =
    requestedDocumentType && documentTypeValues.has(requestedDocumentType)
      ? requestedDocumentType
      : "all"
  const requestedSort = first(params.sort)
  const sort: ApprovalSortOrder = requestedSort === "newest" ? "newest" : "oldest"
  const requestedDirection = first(params.direction)
  const direction: ApprovalCursorDirection = requestedDirection === "previous" ? "previous" : "next"
  const requestedLimit = Number(first(params.limit) || 20)
  const limit = pageSizes.includes(requestedLimit) ? requestedLimit : 20
  const cursor = first(params.cursor)?.trim() || null
  const page = cursor ? Math.max(1, Number(first(params.page) || 1) || 1) : 1

  return {
    entity: "document",
    status,
    documentType,
    sort,
    search: (first(params.q) || "").trim().slice(0, 180),
    limit,
    cursor,
    direction: cursor ? direction : "next",
    page,
  }
}

function buildHref(
  current: DocumentPageState,
  changes: Record<string, string | number | null>,
  preserveCursor = false
) {
  const params = new URLSearchParams()
  params.set("status", current.status)
  params.set("sort", current.sort)
  params.set("limit", String(current.limit))
  if (current.documentType !== "all") params.set("document_type", current.documentType)
  if (current.search) params.set("q", current.search)
  if (preserveCursor && current.cursor) {
    params.set("cursor", current.cursor)
    params.set("direction", current.direction)
    params.set("page", String(current.page))
  }
  for (const [key, rawValue] of Object.entries(changes)) {
    if (
      rawValue === null ||
      rawValue === "" ||
      (key === "document_type" && rawValue === "all")
    ) {
      params.delete(key)
    } else {
      params.set(key, String(rawValue))
    }
  }
  if (!preserveCursor) {
    params.delete("cursor")
    params.delete("direction")
    params.delete("page")
  }
  return `/super-admin/vehicle-documents?${params.toString()}`
}

export default async function VehicleDocumentAttentionPage({ searchParams }: PageProps) {
  const state = parseState(await searchParams)
  const [summary, pageData] = await Promise.all([
    getApprovalQueueSummary(),
    getApprovalQueuePage(
      state,
      state.documentType === "all" ? null : state.documentType
    ),
  ])
  const items = pageData.items as DocumentApprovalItem[]
  const isExpired = state.status === "expired"
  const activeDocumentLabel = documentTypeLabel(state.documentType)

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-emerald-950 px-5 py-6 text-white shadow-lg sm:px-7 lg:px-8">
          <div className="absolute -right-20 -top-24 size-72 rounded-full border border-white/10" />
          <div className="absolute -bottom-24 right-24 size-64 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                <FileClock className="size-3.5" /> Vehicle compliance workspace
              </Badge>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                Vehicle documents
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/75">
                Follow current approved vehicle documents that have expired or will expire within
                the next 30 days. Results use backend cursor pagination for national-scale data.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:min-w-[360px]">
              <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3">
                <p className="text-xs text-rose-100/80">Expired documents</p>
                <p className="mt-1 text-2xl font-semibold">{summary.documents.expired}</p>
              </div>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3">
                <p className="text-xs text-amber-100/80">Expires within 30 days</p>
                <p className="mt-1 text-2xl font-semibold">{summary.documents.expiring_soon}</p>
              </div>
            </div>
          </div>
        </section>

        <Card className="overflow-hidden border-slate-200/80 shadow-sm">
          <CardContent className="p-0">
            <div className="border-b p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <Link
                  href={buildHref(state, { status: "expired" })}
                  className={cn(
                    "flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition",
                    isExpired
                      ? "bg-white text-rose-800 shadow-sm"
                      : "text-muted-foreground hover:bg-white/60"
                  )}
                >
                  <ShieldAlert className="size-4" />
                  Expired
                  <Badge variant="secondary">{summary.documents.expired}</Badge>
                </Link>
                <Link
                  href={buildHref(state, { status: "expiring_soon" })}
                  className={cn(
                    "flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition",
                    !isExpired
                      ? "bg-white text-amber-800 shadow-sm"
                      : "text-muted-foreground hover:bg-white/60"
                  )}
                >
                  <CalendarClock className="size-4" />
                  Expires within 30 days
                  <Badge variant="secondary">{summary.documents.expiring_soon}</Badge>
                </Link>
              </div>
            </div>

            <div className="border-b bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {isExpired ? "Expired current documents" : "Documents expiring within 30 days"}
                    </p>
                    {state.documentType !== "all" ? (
                      <Badge variant="outline" className="bg-white">
                        {activeDocumentLabel}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Page {state.page} · {items.length} records loaded from the cursor feed
                  </p>
                </div>
                <form className="grid gap-2 sm:grid-cols-2 xl:w-[980px] xl:grid-cols-[minmax(220px,1fr)_190px_150px_100px_auto]">
                  <input type="hidden" name="status" value={state.status} />
                  <div className="relative sm:col-span-2 xl:col-span-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      name="q"
                      defaultValue={state.search}
                      placeholder="Search vehicle, owner, provider, or document..."
                      className="bg-white pl-9"
                    />
                  </div>
                  <label className="relative">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <select
                      name="document_type"
                      defaultValue={state.documentType}
                      aria-label="Filter by document type"
                      className="h-10 w-full appearance-none rounded-md border border-input bg-white pl-9 pr-3 text-sm"
                    >
                      {documentTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="relative">
                    <SortAsc className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <select
                      name="sort"
                      defaultValue={state.sort}
                      className="h-10 w-full appearance-none rounded-md border border-input bg-white pl-9 pr-3 text-sm"
                    >
                      <option value="oldest">Oldest first</option>
                      <option value="newest">Newest first</option>
                    </select>
                  </label>
                  <select
                    name="limit"
                    defaultValue={state.limit}
                    aria-label="Rows per page"
                    className="h-10 rounded-md border border-input bg-white px-3 text-sm"
                  >
                    {pageSizes.map((size) => (
                      <option key={size} value={size}>{size} rows</option>
                    ))}
                  </select>
                  <Button type="submit">
                    <Filter /> Apply filters
                  </Button>
                </form>
              </div>
            </div>

            <div className="space-y-3 p-3 sm:p-4">
              {items.length ? (
                items.map((item) => {
                  const openHref = documentHref(item)
                  return (
                    <article key={item.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_170px_170px_auto] xl:items-center">
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className={cn(
                              "flex size-11 shrink-0 items-center justify-center rounded-xl",
                              isExpired
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-800"
                            )}
                          >
                            <FileClock className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-semibold">
                                {item.registration_number_display || item.registration_number}
                              </h2>
                              <Badge
                                variant="outline"
                                className={cn(
                                  isExpired
                                    ? "border-rose-200 bg-rose-50 text-rose-800"
                                    : "border-amber-200 bg-amber-50 text-amber-800"
                                )}
                              >
                                {isExpired ? "Expired" : "Expiring soon"}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm font-medium capitalize">
                              {humanize(item.document_type)} · Version {item.version}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>Owner: {item.owner.owner_name}</span>
                              <span>Provider: {item.provider.name || "Not connected"}</span>
                              <span>Reference: {item.document_number || "Not provided"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Expiry date</p>
                          <p className="mt-1 text-sm font-semibold">{formatDate(item.expires_at)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Attention</p>
                          <p className={cn("mt-1 text-sm font-semibold", isExpired ? "text-rose-700" : "text-amber-800")}>
                            {expiryDistance(item.expires_at, state.status)}
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {openHref ? (
                            <Button asChild variant="outline" size="sm">
                              <a href={openHref} target="_blank" rel="noreferrer">
                                <ExternalLink /> View document
                              </a>
                            </Button>
                          ) : null}
                          <Button asChild size="sm">
                            <Link href={`/super-admin/vehicles/${item.vehicle_id}/documents`}>
                              <CarFront /> Open vehicle
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </article>
                  )
                })
              ) : (
                <div className="flex min-h-52 items-center justify-center rounded-2xl border border-dashed bg-slate-50 p-8 text-center">
                  <div>
                    <Clock3 className="mx-auto size-9 text-muted-foreground" />
                    <p className="mt-3 font-semibold">No document attention records</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {state.search || state.documentType !== "all"
                        ? `No ${activeDocumentLabel.toLowerCase()} records match the current filters.`
                        : isExpired
                          ? "No current approved vehicle documents are expired."
                          : "No current approved vehicle documents expire within the next 30 days."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Backend cursor pagination · {state.limit} records per page
              </p>
              <div className="flex items-center justify-end gap-2">
                <span className="mr-2 text-xs text-muted-foreground">Page {state.page}</span>
                <Button
                  asChild={Boolean(pageData.has_previous && pageData.previous_cursor)}
                  variant="outline"
                  size="sm"
                  disabled={!pageData.has_previous || !pageData.previous_cursor}
                >
                  {pageData.has_previous && pageData.previous_cursor ? (
                    <Link
                      href={buildHref(
                        state,
                        {
                          cursor: pageData.previous_cursor,
                          direction: "previous",
                          page: Math.max(1, state.page - 1),
                        },
                        true
                      )}
                    >
                      <ArrowLeft /> Previous
                    </Link>
                  ) : (
                    <><ArrowLeft /> Previous</>
                  )}
                </Button>
                <Button
                  asChild={Boolean(pageData.has_next && pageData.next_cursor)}
                  variant="outline"
                  size="sm"
                  disabled={!pageData.has_next || !pageData.next_cursor}
                >
                  {pageData.has_next && pageData.next_cursor ? (
                    <Link
                      href={buildHref(
                        state,
                        {
                          cursor: pageData.next_cursor,
                          direction: "next",
                          page: state.page + 1,
                        },
                        true
                      )}
                    >
                      Next <ArrowRight />
                    </Link>
                  ) : (
                    <>Next <ArrowRight /></>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
