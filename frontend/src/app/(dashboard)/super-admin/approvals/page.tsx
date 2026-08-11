import {
  Clock3,
  ClipboardCheck,
  FileCheck2,
  SearchCheck,
  ShieldCheck,
} from "lucide-react"
import { redirect } from "next/navigation"

import { ApprovalQueue } from "@/components/approvals/approval-queue"
import { Badge } from "@/components/ui/badge"
import {
  getApprovalQueuePage,
  getApprovalQueueSummary,
} from "@/features/approvals/data"
import type {
  ApprovalCursorDirection,
  ApprovalQueueEntityType,
  ApprovalQueueState,
  ApprovalSortOrder,
  ApprovalStatusFilter,
} from "@/features/approvals/types"

export const dynamic = "force-dynamic"

const numberFormatter = new Intl.NumberFormat("en-US")
const entityValues = new Set<ApprovalQueueEntityType>([
  "provider",
  "owner",
  "vehicle",
  "driver",
  "document",
])
const statusValues = new Set<ApprovalStatusFilter>(["all", "pending", "under_review"])
const sortValues = new Set<ApprovalSortOrder>(["oldest", "newest"])
const directionValues = new Set<ApprovalCursorDirection>(["next", "previous"])
const limitValues = new Set([10, 20, 50, 100])

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function waitingLabel(value: number | null) {
  if (value === null) return "Current page is clear"
  const elapsedMs = Date.now() - value
  if (elapsedMs <= 0) return "Submitted recently"
  const hours = Math.floor(elapsedMs / 3_600_000)
  if (hours < 24) return `${Math.max(hours, 1)}h oldest on page`
  return `${Math.floor(hours / 24)}d oldest on page`
}

function parseState(params: Record<string, string | string[] | undefined>): ApprovalQueueState {
  const entityValue = first(params.entity) as ApprovalQueueEntityType | undefined
  const entity = entityValue && entityValues.has(entityValue) ? entityValue : "provider"
  const statusValue = first(params.status) as ApprovalStatusFilter | undefined
  const requestedStatus = statusValue && statusValues.has(statusValue) ? statusValue : null
  const status: ApprovalStatusFilter = entity === "document" ? "pending" : requestedStatus || "all"
  const sortValue = first(params.sort) as ApprovalSortOrder | undefined
  const directionValue = first(params.direction) as ApprovalCursorDirection | undefined
  const parsedLimit = Number(first(params.limit) || 20)
  const parsedPage = Math.max(1, Number(first(params.page) || 1) || 1)
  const cursor = first(params.cursor)?.trim() || null

  return {
    entity,
    status,
    sort: sortValue && sortValues.has(sortValue) ? sortValue : "oldest",
    search: (first(params.q) || "").trim().slice(0, 180),
    limit: limitValues.has(parsedLimit) ? parsedLimit : 20,
    cursor,
    direction:
      cursor && directionValue && directionValues.has(directionValue)
        ? directionValue
        : "next",
    page: cursor ? parsedPage : 1,
  }
}

export default async function ApprovalQueuePage({ searchParams }: PageProps) {
  const rawParams = await searchParams
  const requestedEntity = first(rawParams.entity)
  const requestedStatus = first(rawParams.status)
  if (
    requestedEntity === "document" &&
    (requestedStatus === "expired" || requestedStatus === "expiring_soon")
  ) {
    redirect(`/super-admin/vehicle-documents?status=${requestedStatus}`)
  }

  const state = parseState(rawParams)
  const [summary, pageData] = await Promise.all([
    getApprovalQueueSummary(),
    getApprovalQueuePage(state),
  ])

  const pending =
    summary.providers.pending +
    summary.owners.pending +
    summary.vehicles.pending +
    summary.drivers.pending +
    summary.documents.pending
  const underReview =
    summary.providers.under_review +
    summary.owners.under_review +
    summary.vehicles.under_review +
    summary.drivers.under_review
  const recordsWithDocuments = pageData.items.filter((item) => item.documents.length > 0).length
  const documentCoverage = pageData.items.length
    ? Math.round((recordsWithDocuments / pageData.items.length) * 100)
    : 100
  const oldestPageItem = pageData.items.reduce<number | null>((oldest, item) => {
    const value = "submitted_at" in item ? item.submitted_at : item.created_at
    const timestamp = new Date(value).getTime()
    if (Number.isNaN(timestamp)) return oldest
    return oldest === null ? timestamp : Math.min(oldest, timestamp)
  }, null)

  const summaryCards = [
    {
      label: "Awaiting action",
      value: formatNumber(summary.total),
      detail: "Entity and document approvals",
      icon: ClipboardCheck,
    },
    {
      label: "New submissions",
      value: formatNumber(pending),
      detail: "Waiting for review to begin",
      icon: SearchCheck,
    },
    {
      label: "Under review",
      value: formatNumber(underReview),
      detail: "Currently in verification",
      icon: ShieldCheck,
    },
    {
      label: state.entity === "document" ? "Pending documents" : "Page documents",
      value:
        state.entity === "document"
          ? formatNumber(summary.documents.pending)
          : `${documentCoverage}%`,
      detail:
        state.entity === "document"
          ? "Submitted updates awaiting Police review"
          : waitingLabel(oldestPageItem),
      icon: FileCheck2,
    },
  ]

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-emerald-950 px-5 py-5 text-white shadow-lg sm:px-6 sm:py-6 lg:px-7">
          <div className="absolute -right-20 -top-24 size-64 rounded-full border border-white/10" />
          <div className="absolute -bottom-24 right-24 size-64 rounded-full bg-emerald-700/20 blur-3xl" />

          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(560px,0.9fr)] xl:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-[11px] text-emerald-100 hover:bg-white/10">
                <ShieldCheck aria-hidden="true" className="size-3.5" />
                Authorized review workspace
              </Badge>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300 sm:text-xs">
                National verification operations
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
                Consolidated approval queue
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-emerald-100/75 sm:text-sm sm:leading-6">
                Review VTS providers, vehicle owners, vehicles, drivers, and pending document
                updates. Document expiry monitoring is managed separately from approval actions.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {summaryCards.map(({ label, value, detail, icon: Icon }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3 backdrop-blur"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] leading-4 text-emerald-100/65">{label}</p>
                    <Icon className="size-3.5 text-emerald-200" aria-hidden="true" />
                  </div>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                  <p className="mt-0.5 truncate text-[9px] text-emerald-100/55">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white/70 px-4 py-3 text-xs text-muted-foreground shadow-sm">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5 text-emerald-700" />
            Search, sorting, and navigation are executed by backend cursor APIs.
          </span>
          <span>
            Page <strong className="text-foreground">{state.page}</strong> · Loaded{" "}
            <strong className="text-foreground">{pageData.items.length}</strong> records
          </span>
        </div>

        <ApprovalQueue summary={summary} pageData={pageData} state={state} />
      </div>
    </div>
  )
}
