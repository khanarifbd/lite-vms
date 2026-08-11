"use client"

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CarFront,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileEdit,
  FileText,
  Filter,
  Gauge,
  Loader2,
  Network,
  Search,
  SortAsc,
  XCircle,
} from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type {
  ApprovalCursorPage,
  ApprovalDecision,
  ApprovalDocument,
  ApprovalEntitySummary,
  ApprovalQueueEntityType,
  ApprovalQueueItem,
  ApprovalQueueState,
  ApprovalQueueSummary,
  DocumentApprovalItem,
  DriverApprovalItem,
  OwnerApprovalItem,
  ProviderApprovalItem,
  VehicleApprovalItem,
} from "@/features/approvals/types"
import { cn } from "@/lib/utils"

type Target = { type: ApprovalQueueEntityType; item: ApprovalQueueItem }
type Props = {
  summary: ApprovalQueueSummary
  pageData: ApprovalCursorPage
  state: ApprovalQueueState
}

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

const entityConfig = {
  provider: { label: "VTS providers", singular: "Provider", icon: Network },
  owner: { label: "Vehicle owners", singular: "Owner", icon: Building2 },
  vehicle: { label: "Vehicles", singular: "Vehicle", icon: CarFront },
  driver: { label: "Drivers", singular: "Driver", icon: Gauge },
  document: { label: "Document approvals", singular: "Document", icon: FileCheck2 },
} satisfies Record<
  ApprovalQueueEntityType,
  { label: string; singular: string; icon: typeof Network }
>

const entities = Object.keys(entityConfig) as ApprovalQueueEntityType[]
const pageSizes = [10, 20, 50, 100]

const decisions: Array<{
  value: ApprovalDecision
  label: string
  description: string
  icon: typeof CheckCircle2
  className: string
}> = [
  {
    value: "approve",
    label: "Approve",
    description: "Verify and activate this submitted record.",
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    value: "request_changes",
    label: "Request changes",
    description: "Return the submitted record for correction.",
    icon: FileEdit,
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    value: "reject",
    label: "Reject",
    description: "Reject the submitted record.",
    icon: XCircle,
    className: "border-red-200 bg-red-50 text-red-800",
  },
]

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "Not available"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" }).format(date)
}

function humanize(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "Not available"
}

function summaryFor(
  summary: ApprovalQueueSummary,
  type: ApprovalQueueEntityType
): ApprovalEntitySummary {
  if (type === "provider") return summary.providers
  if (type === "owner") return summary.owners
  if (type === "vehicle") return summary.vehicles
  if (type === "driver") return summary.drivers
  return summary.documents
}

function itemId(target: Target) {
  return target.item.id
}

function isDriverProfileChange(target: Target) {
  return (
    target.type === "driver" &&
    (target.item as DriverApprovalItem).profile_change_status === "pending"
  )
}

function isDocumentTarget(target: Target): target is Target & { item: DocumentApprovalItem } {
  return target.type === "document"
}

function documentNeedsReview(target: Target) {
  return isDocumentTarget(target) && target.item.review_required
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ")
  if (value === null || value === "") return "Not provided"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return "Updated structured information"
  return String(value)
}

function profileChangeRows(target: Target): Array<[string, string]> {
  if (!isDriverProfileChange(target)) return []
  const changes = (target.item as DriverApprovalItem).pending_profile_changes
  if (!changes) return []
  return Object.entries(changes)
    .filter(([field]) => !["documents", "declaration_accepted"].includes(field))
    .map(([field, value]) => [`Proposed ${humanize(field)}`, displayValue(value)])
}

function itemTitle(target: Target) {
  if (target.type === "provider") return (target.item as ProviderApprovalItem).legal_name
  if (target.type === "owner") return (target.item as OwnerApprovalItem).owner_name
  if (target.type === "vehicle") {
    const item = target.item as VehicleApprovalItem
    return item.registration_number_display || item.registration_number
  }
  if (target.type === "document") {
    const item = target.item as DocumentApprovalItem
    return item.registration_number_display || item.registration_number
  }
  return (target.item as DriverApprovalItem).full_name
}

function itemReference(target: Target) {
  if (target.type === "provider") {
    const item = target.item as ProviderApprovalItem
    return item.application_number || item.code
  }
  if (target.type === "owner") {
    const item = target.item as OwnerApprovalItem
    return item.application_number || item.owner_code
  }
  if (target.type === "vehicle") {
    const item = target.item as VehicleApprovalItem
    return [item.brand, item.model, item.vehicle_type].filter(Boolean).join(" · ")
  }
  if (target.type === "document") {
    const item = target.item as DocumentApprovalItem
    return `${humanize(item.document_type)} · Version ${item.version}`
  }
  const item = target.item as DriverApprovalItem
  return `${item.driver_code} · ${item.licence.licence_number}`
}

function itemStatus(target: Target) {
  if (target.type === "provider") return (target.item as ProviderApprovalItem).status
  if (target.type === "document") return (target.item as DocumentApprovalItem).status
  if (isDriverProfileChange(target)) {
    return (target.item as DriverApprovalItem).profile_change_status || "pending"
  }
  return (target.item as OwnerApprovalItem | VehicleApprovalItem | DriverApprovalItem)
    .verification_status
}

function itemDate(target: Target) {
  if (target.type === "vehicle") return (target.item as VehicleApprovalItem).created_at
  if (target.type === "document") return (target.item as DocumentApprovalItem).created_at
  if (isDriverProfileChange(target)) {
    return (target.item as DriverApprovalItem).profile_change_submitted_at
  }
  return (target.item as ProviderApprovalItem | OwnerApprovalItem | DriverApprovalItem)
    .submitted_at
}

function itemDocuments(target: Target): ApprovalDocument[] {
  if (isDriverProfileChange(target)) {
    const documents = (target.item as DriverApprovalItem).pending_profile_changes?.documents
    return (documents || []).map((document, index) => ({
      ...document,
      id: `profile-change-document-${index}`,
      file_name: document.file_name || null,
      status: "pending",
    }))
  }
  return target.item.documents || []
}

function itemContext(target: Target) {
  if (target.type === "provider") {
    const item = target.item as ProviderApprovalItem
    return [
      item.district || "District not provided",
      item.btrc_license_number
        ? `BTRC ${item.btrc_license_number}`
        : "BTRC licence missing",
      `${item.estimated_vehicle_count.toLocaleString("en-US")} estimated vehicles`,
    ]
  }
  if (target.type === "owner") {
    const item = target.item as OwnerApprovalItem
    return [
      humanize(item.owner_type),
      item.district || "District not provided",
      `${item.total_vehicles.toLocaleString("en-US")} vehicles`,
    ]
  }
  if (target.type === "vehicle") {
    const item = target.item as VehicleApprovalItem
    return [
      item.owner.owner_name,
      item.created_by_provider_name || "No VTS provider",
      `Chassis ${item.chassis_number}`,
    ]
  }
  if (target.type === "document") {
    const item = target.item as DocumentApprovalItem
    return [
      item.owner.owner_name,
      item.provider.name || "No VTS provider",
      `Vehicle remains ${humanize(item.vehicle_verification_status)}`,
    ]
  }
  const item = target.item as DriverApprovalItem
  return [
    isDriverProfileChange(target) ? "Verified profile change" : "Initial application",
    item.district || "District not provided",
    `${humanize(item.licence.licence_type)} licence`,
    item.current_vehicle_registration || "No active vehicle assignment",
  ]
}

function detailRows(target: Target): Array<[string, string]> {
  if (target.type === "provider") {
    const item = target.item as ProviderApprovalItem
    return [
      ["Application", item.application_number],
      ["Provider code", item.code],
      ["Trade name", item.trade_name || "Not provided"],
      ["District", item.district],
      ["BTRC licence", item.btrc_license_number],
      ["Trade licence", item.trade_license_number],
      ["Technical contact", `${item.technical_contact_name} · ${item.technical_contact_phone}`],
      ["Email", item.technical_contact_email],
      ["Estimated vehicles", item.estimated_vehicle_count.toLocaleString("en-US")],
      ["Integration", item.integration_status || "Not configured"],
    ]
  }
  if (target.type === "owner") {
    const item = target.item as OwnerApprovalItem
    return [
      ["Application", item.application_number],
      ["Owner code", item.owner_code],
      ["Owner type", humanize(item.owner_type)],
      ["Identity", item.identity_or_registration_reference],
      ["Phone", item.phone || "Not provided"],
      ["Email", item.email || "Not provided"],
      ["District", item.district],
      ["Address", item.registered_address],
      ["Created by provider", item.created_by_provider_name || "Direct registration"],
      ["Registered vehicles", item.total_vehicles.toLocaleString("en-US")],
    ]
  }
  if (target.type === "vehicle") {
    const item = target.item as VehicleApprovalItem
    return [
      ["Registration", item.registration_number_display || item.registration_number],
      ["Chassis", item.chassis_number],
      ["Engine", item.engine_number || "Not provided"],
      ["Vehicle type", item.vehicle_type],
      ["Brand / model", [item.brand, item.model].filter(Boolean).join(" ") || "Not provided"],
      ["Manufacturing year", item.manufacturing_year?.toString() || "Not provided"],
      ["Owner", item.owner.owner_name],
      ["Owner code", item.owner.owner_code || "Not provided"],
      ["VTS provider", item.created_by_provider_name || "Not assigned"],
    ]
  }
  if (target.type === "document") {
    const item = target.item as DocumentApprovalItem
    return [
      ["Vehicle", item.registration_number_display || item.registration_number],
      ["Vehicle status", humanize(item.vehicle_verification_status)],
      ["Document type", humanize(item.document_type)],
      ["Document number", item.document_number || "Not provided"],
      ["Version", String(item.version)],
      ["Uploaded by", humanize(item.source)],
      ["Owner", `${item.owner.owner_name} · ${item.owner.owner_code || "No code"}`],
      ["Owner phone", item.owner.phone || "Not provided"],
      ["VTS provider", item.provider.name || "Not connected"],
      ["Issued", formatDateOnly(item.issued_at)],
      ["Expires", formatDateOnly(item.expires_at)],
      ["Expiry state", humanize(item.expiry_status)],
    ]
  }
  const item = target.item as DriverApprovalItem
  return [
    ...profileChangeRows(target),
    ["Review type", isDriverProfileChange(target) ? "Verified profile change" : "Initial application"],
    ["Driver code", item.driver_code],
    ["NID reference", item.nid_reference],
    ["Mobile", item.mobile],
    ["Email", item.email],
    ["District", item.district],
    ["Blood group", item.blood_group || "Not provided"],
    ["Licence number", item.licence.licence_number],
    ["Licence type", humanize(item.licence.licence_type)],
    ["Vehicle classes", item.licence.vehicle_classes.join(", ") || "Not provided"],
    ["Licence expiry", formatDate(item.licence.expiry_date)],
    ["Current vehicle", item.current_vehicle_registration || "Not assigned"],
    ["Vehicle owner", item.current_owner_name || "Not assigned"],
    ["VTS provider", item.current_provider_name || "Not assigned"],
    ["Behaviour score", `${Math.round(item.behaviour_score)}%`],
  ]
}

function documentHref(document: ApprovalDocument, download = false) {
  if (!document.storage_key) return null
  const search = new URLSearchParams({
    storageKey: document.storage_key,
    fileName: document.file_name || `${document.document_type}.pdf`,
    download: download ? "1" : "0",
  })
  return `/api/documents?${search.toString()}`
}

function DocumentList({ target, compact = false }: { target: Target; compact?: boolean }) {
  const documents = itemDocuments(target)
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">Submitted documents</h3>
          {!compact ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Open each document before recording a decision.
            </p>
          ) : null}
        </div>
        <Badge variant="secondary" className="shrink-0">{documents.length}</Badge>
      </div>
      {documents.length ? (
        <div className="space-y-2">
          {documents.map((document) => {
            const openHref = documentHref(document)
            const downloadHref = documentHref(document, true)
            return (
              <div
                key={document.id}
                className="grid min-w-0 gap-3 rounded-xl border px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize">
                      {humanize(document.document_type)}
                    </p>
                    <p className="mt-0.5 break-all text-xs leading-5 text-muted-foreground">
                      {document.file_name || "Stored document"}
                    </p>
                    {document.document_number || document.document_reference ? (
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        Reference: {document.document_number || document.document_reference}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
                  <StatusBadge status={document.status} />
                  {openHref ? (
                    <Button asChild type="button" variant="outline" size="sm">
                      <a href={openHref} target="_blank" rel="noreferrer">
                        <ExternalLink /> Open document
                      </a>
                    </Button>
                  ) : null}
                  {downloadHref ? (
                    <Button asChild type="button" variant="ghost" size="icon-sm">
                      <a href={downloadHref} aria-label="Download document">
                        <Download />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
          No document metadata is available.
        </div>
      )}
    </div>
  )
}

function QueueEmpty({ type, filtered }: { type: ApprovalQueueEntityType; filtered: boolean }) {
  const Icon = entityConfig[type].icon
  const clearMessage =
    type === "document"
      ? "There are no submitted vehicle documents waiting for review."
      : `There are no ${entityConfig[type].label.toLowerCase()} waiting for review.`
  return (
    <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed bg-slate-50 px-5 py-6 text-center">
      <div className="flex flex-col items-center sm:flex-row sm:text-left">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
          <Icon className="size-6" />
        </div>
        <div className="mt-3 sm:ml-4 sm:mt-0">
          <p className="font-semibold">{filtered ? "No matching records" : "Queue is clear"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered ? "Change the backend search or status filter." : clearMessage}
          </p>
        </div>
      </div>
    </div>
  )
}

export function ApprovalQueue({ summary, pageData, state }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const currentSearch = useSearchParams()
  const [search, setSearch] = useState(state.search)
  const [detailsTarget, setDetailsTarget] = useState<Target | null>(null)
  const [reviewTarget, setReviewTarget] = useState<Target | null>(null)
  const [decision, setDecision] = useState<ApprovalDecision>("approve")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(state.search), 0)
    return () => window.clearTimeout(timer)
  }, [state.search])

  const navigate = (changes: Record<string, string | null>, resetCursor = true) => {
    const params = new URLSearchParams(currentSearch.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") params.delete(key)
      else params.set(key, value)
    }
    if (changes.entity) {
      params.set("status", changes.entity === "document" ? "pending" : "all")
    }
    if (resetCursor) {
      params.delete("cursor")
      params.delete("direction")
      params.delete("page")
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const activeSummary = summaryFor(summary, state.entity)
  const targets: Target[] = pageData.items.map((item) => ({ type: state.entity, item }))
  const notesRequired = Boolean(
    reviewTarget && (reviewTarget.type !== "provider" || decision !== "approve")
  )
  const notesValid = !notesRequired || notes.trim().length >= 3

  const submitReview = async () => {
    if (!reviewTarget || !notesValid) return
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/super-admin/approvals/${reviewTarget.type}/${itemId(reviewTarget)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            notes: notes.trim(),
            profile_change: isDriverProfileChange(reviewTarget),
          }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to submit the review decision.")
      }
      toast.success("Review decision submitted", {
        description: `${itemTitle(reviewTarget)} was ${humanize(decision)}.`,
      })
      setReviewTarget(null)
      setNotes("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit review.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Card className="overflow-hidden border-slate-200/80 shadow-sm">
        <CardContent className="p-0">
          <div className="border-b px-3 pt-3 sm:px-4 sm:pt-4">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-3 xl:grid-cols-5">
              {entities.map((type) => {
                const Icon = entityConfig[type].icon
                const entitySummary = summaryFor(summary, type)
                const active = state.entity === type
                const count = type === "document" ? summary.documents.pending : entitySummary.total
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => navigate({ entity: type })}
                    className={cn(
                      "flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-xs font-medium transition",
                      active
                        ? "bg-white text-emerald-950 shadow-sm"
                        : "text-muted-foreground hover:bg-white/60 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{entityConfig[type].label}</span>
                    <Badge variant="secondary" className="min-w-6 justify-center px-1.5 text-[10px]">
                      {count}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-b bg-slate-50/70 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {state.entity === "document"
                      ? "Vehicle document approvals"
                      : `${entityConfig[state.entity].label} awaiting review`}
                  </p>
                  <Badge variant="outline">{activeSummary.pending} pending</Badge>
                  {state.entity !== "document" ? (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      {activeSummary.under_review} under review
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Page {state.page} · {pageData.items.length} records loaded
                </p>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  navigate({ q: search.trim() || null })
                }}
                className={cn(
                  "grid gap-2",
                  state.entity === "document"
                    ? "sm:grid-cols-[minmax(260px,1fr)_145px] xl:w-[620px]"
                    : "sm:grid-cols-[minmax(220px,1fr)_180px_145px] xl:w-[740px]"
                )}
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={
                      state.entity === "document"
                        ? "Search pending documents..."
                        : `Search ${entityConfig[state.entity].label.toLowerCase()}...`
                    }
                    className="bg-white pl-9"
                  />
                </div>
                {state.entity !== "document" ? (
                  <label className="relative">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <select
                      value={state.status}
                      onChange={(event) => navigate({ status: event.target.value })}
                      className="h-10 w-full appearance-none rounded-md border border-input bg-white pl-9 pr-3 text-sm"
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="under_review">Under review</option>
                    </select>
                  </label>
                ) : null}
                <label className="relative">
                  <SortAsc className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={state.sort}
                    onChange={(event) => navigate({ sort: event.target.value })}
                    className="h-10 w-full appearance-none rounded-md border border-input bg-white pl-9 pr-3 text-sm"
                  >
                    <option value="oldest">Oldest first</option>
                    <option value="newest">Newest first</option>
                  </select>
                </label>
              </form>
            </div>
          </div>

          <div className="space-y-2.5 p-3 sm:p-4">
            {targets.length ? (
              targets.map((target) => {
                const Icon = entityConfig[target.type].icon
                const canReview = target.type !== "document" || documentNeedsReview(target)
                return (
                  <article
                    key={`${target.type}-${itemId(target)}`}
                    className="rounded-2xl border bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-semibold">{itemTitle(target)}</h3>
                            <StatusBadge status={itemStatus(target)} />
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {itemReference(target)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {itemContext(target).map((value) => (
                              <span key={value}>{value}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[180px_90px_auto] lg:w-auto">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[10px] text-muted-foreground">
                            {target.type === "document" ? "Uploaded" : "Submitted"}
                          </p>
                          <p className="mt-0.5 truncate text-xs font-medium">
                            {formatDate(itemDate(target))}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[10px] text-muted-foreground">Documents</p>
                          <p className="mt-0.5 text-xs font-medium">{itemDocuments(target).length}</p>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setDetailsTarget(target)}
                          >
                            <Eye /> View
                          </Button>
                          {canReview ? (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-emerald-800 text-white hover:bg-emerald-900"
                              onClick={() => {
                                setReviewTarget(target)
                                setDecision("approve")
                                setNotes("")
                              }}
                            >
                              <ClipboardCheck /> Review
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })
            ) : (
              <QueueEmpty
                type={state.entity}
                filtered={Boolean(state.search) || state.status !== (state.entity === "document" ? "pending" : "all")}
              />
            )}
          </div>

          <div className="flex flex-col gap-3 border-t bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Rows per page
              <select
                value={state.limit}
                onChange={(event) => navigate({ limit: event.target.value })}
                className="h-8 rounded-md border bg-white px-2 text-xs"
              >
                {pageSizes.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-xs text-muted-foreground">Page {state.page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!pageData.has_previous || !pageData.previous_cursor}
                onClick={() =>
                  navigate(
                    {
                      cursor: pageData.previous_cursor,
                      direction: "previous",
                      page: String(Math.max(1, state.page - 1)),
                    },
                    false
                  )
                }
              >
                <ArrowLeft /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pageData.has_next || !pageData.next_cursor}
                onClick={() =>
                  navigate(
                    {
                      cursor: pageData.next_cursor,
                      direction: "next",
                      page: String(state.page + 1),
                    },
                    false
                  )
                }
              >
                Next <ArrowRight />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailsTarget)} onOpenChange={(open) => !open && setDetailsTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {detailsTarget ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-xl">{itemTitle(detailsTarget)}</DialogTitle>
                <DialogDescription>
                  {detailsTarget.type === "document"
                    ? "Vehicle, owner, provider, expiry, and submitted document information."
                    : `${entityConfig[detailsTarget.type].singular} identity, operational context, and submitted documents.`}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {detailRows(detailsTarget).map(([rowLabel, value]) => (
                  <div key={rowLabel} className="rounded-xl border bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {rowLabel}
                    </p>
                    <p className="mt-1 break-words text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>
              <DocumentList target={detailsTarget} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailsTarget(null)}>Close</Button>
                {detailsTarget.type !== "document" || documentNeedsReview(detailsTarget) ? (
                  <Button
                    className="bg-emerald-800 text-white hover:bg-emerald-900"
                    onClick={() => {
                      const target = detailsTarget
                      setDetailsTarget(null)
                      setReviewTarget(target)
                      setDecision("approve")
                      setNotes("")
                    }}
                  >
                    <ClipboardCheck /> Review record
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reviewTarget)}
        onOpenChange={(open) => !open && !submitting && setReviewTarget(null)}
      >
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-4xl">
          {reviewTarget ? (
            <>
              <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5 sm:px-6">
                <DialogTitle className="pr-8 text-xl sm:text-2xl">
                  Review {itemTitle(reviewTarget)}
                </DialogTitle>
                <DialogDescription className="max-w-3xl">
                  {reviewTarget.type === "document"
                    ? "This decision changes only the submitted document. The verified vehicle remains verified."
                    : "Verify the submitted identity and documents, then record the official decision."}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                {isDriverProfileChange(reviewTarget) ? (
                  <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                    {profileChangeRows(reviewTarget).map(([rowLabel, value]) => (
                      <div key={rowLabel} className="rounded-xl border bg-slate-50 p-3">
                        <p className="text-xs text-muted-foreground">{rowLabel}</p>
                        <p className="mt-1 break-words text-sm font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                <DocumentList target={reviewTarget} compact />

                <div className="grid gap-3 md:grid-cols-3">
                  {decisions.map((option) => {
                    const Icon = option.icon
                    const selected = decision === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDecision(option.value)}
                        disabled={submitting}
                        className={cn(
                          "min-h-36 rounded-2xl border p-4 text-left transition disabled:opacity-50",
                          selected ? option.className : "border-slate-200 bg-white hover:bg-slate-50"
                        )}
                      >
                        <Icon className="size-6" />
                        <p className="mt-3 text-base font-semibold">{option.label}</p>
                        <p className="mt-1 text-sm leading-6 opacity-75">{option.description}</p>
                      </button>
                    )
                  })}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approval-notes">
                    Review notes {notesRequired ? <span className="text-destructive">*</span> : "(optional)"}
                  </Label>
                  <Textarea
                    id="approval-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={5}
                    maxLength={2000}
                    disabled={submitting}
                    className="min-h-32 resize-y"
                    placeholder="Add verification findings, reason, or correction instructions..."
                  />
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-between">
                    <span>{!notesValid ? "Enter at least 3 characters." : "These notes are stored in the audit history."}</span>
                    <span className="shrink-0">{notes.length}/2000</span>
                  </div>
                </div>
              </div>

              <DialogFooter className="shrink-0 border-t bg-white px-5 py-4 sm:px-6">
                <Button variant="outline" onClick={() => setReviewTarget(null)} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  onClick={submitReview}
                  disabled={submitting || !notesValid}
                  className={cn(
                    decision === "approve" && "bg-emerald-800 text-white hover:bg-emerald-900",
                    decision === "request_changes" && "bg-amber-600 text-white hover:bg-amber-700",
                    decision === "reject" && "bg-red-700 text-white hover:bg-red-800"
                  )}
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" />
                  ) : decision === "approve" ? (
                    <CheckCircle2 />
                  ) : decision === "request_changes" ? (
                    <FileEdit />
                  ) : (
                    <XCircle />
                  )}
                  {submitting ? "Submitting..." : `Confirm ${humanize(decision)}`}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
