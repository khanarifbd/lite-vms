"use client"

import {
  Building2,
  CheckCircle2,
  Download,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Pencil,
  Search,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type {
  OwnerDocument,
  ProviderOwnerCustomer,
  ProviderOwnerPortfolioItem,
  ProviderOwnerPortfolioPage,
  ProviderOwnerSummary,
} from "@/features/provider/owner-types"

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "The request could not be completed."
    throw new Error(message)
  }
  return payload as T
}

function text(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function nullable(value: string) {
  return value ? value : null
}

function documentHref(document: OwnerDocument, download = false) {
  const search = new URLSearchParams({
    storageKey: document.storage_key,
    fileName: document.file_name || `${document.document_type}.pdf`,
    download: download ? "1" : "0",
  })
  return `/api/documents?${search.toString()}`
}

function OwnerDocuments({ documents }: { documents: OwnerDocument[] }) {
  if (!documents.length) {
    return (
      <p className="rounded-xl border border-dashed bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
        No document metadata is available.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((document) => (
        <div
          key={document.id}
          className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <FileText className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium capitalize">
                {document.document_type.replaceAll("_", " ")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {document.file_name || "Stored document"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={document.status} />
            <Button asChild size="sm" variant="outline">
              <a href={documentHref(document)} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" /> Open
              </a>
            </Button>
            <Button asChild size="icon-sm" variant="ghost">
              <a href={documentHref(document, true)} aria-label="Download document">
                <Download aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  defaultValue,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  defaultValue?: string | null
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required ? " *" : ""}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue || ""}
      />
    </div>
  )
}

function EditOwnerDialog({
  target,
  onOpenChange,
}: {
  target: ProviderOwnerCustomer | null
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!target) return
    const form = new FormData(event.currentTarget)
    const payload = {
      owner_name: text(form, "ownerName"),
      email: nullable(text(form, "email")),
      mobile: nullable(text(form, "mobile")),
      registered_address: text(form, "registeredAddress"),
      district: text(form, "district"),
      website_url: nullable(text(form, "websiteUrl")),
      trade_license_number: nullable(text(form, "tradeLicenseNumber")),
      tin_number: nullable(text(form, "tinNumber")),
      bin_number: nullable(text(form, "binNumber")),
    }

    setSubmitting(true)
    try {
      const result = await parseResponse<{ reverification_required: boolean }>(
        await fetch(`/api/provider/owners/${target.owner.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      )
      toast.success(
        result.reverification_required
          ? "Owner updated and returned to the verification queue"
          : "Owner details updated"
      )
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the owner.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {target ? (
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Edit {target.owner.owner_name}</DialogTitle>
              <DialogDescription>
                Changes to legal identity or licence information return the owner to national verification.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="ownerName" label="Owner name" required defaultValue={target.owner.owner_name} />
              <Field name="email" label="Email" type="email" defaultValue={target.owner.email} />
              <Field name="mobile" label="Mobile" defaultValue={target.owner.phone} />
              <Field name="district" label="District" required defaultValue={target.owner.district} />
              <Field name="websiteUrl" label="Website" type="url" defaultValue={target.owner.website_url} />
              {target.owner.owner_type === "company" ? (
                <>
                  <Field name="tradeLicenseNumber" label="Trade licence" defaultValue={target.owner.trade_license_number} />
                  <Field name="tinNumber" label="TIN" defaultValue={target.owner.tin_number} />
                  <Field name="binNumber" label="BIN" defaultValue={target.owner.bin_number} />
                </>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="registeredAddress">Registered address *</Label>
              <Textarea
                id="registeredAddress"
                name="registeredAddress"
                required
                defaultValue={target.owner.registered_address}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-emerald-800 text-white hover:bg-emerald-900">
                {submitting ? <Loader2 className="animate-spin" /> : <Pencil />}
                {submitting ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type OwnerFilters = { search: string; status: string; limit: number }
type PaginationItem = number | "ellipsis"

const linkStatuses = [
  ["active", "Active"],
  ["pending_owner_approval", "Owner approval due"],
  ["pending_provider_approval", "Provider approval due"],
  ["rejected", "Rejected"],
  ["suspended", "Suspended"],
  ["ended", "Ended"],
] as const

function ownerPageHref(page: number, filters: OwnerFilters) {
  const params = new URLSearchParams()
  if (page > 1) params.set("page", String(page))
  if (filters.search) params.set("search", filters.search)
  if (filters.status) params.set("status", filters.status)
  if (filters.limit !== 25) params.set("limit", String(filters.limit))
  const query = params.toString()
  return query ? `/provider/owners?${query}` : "/provider/owners"
}

function paginationItems(currentPage: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const items: PaginationItem[] = [1]
  const start = Math.max(2, currentPage - 2)
  const end = Math.min(pageCount - 1, currentPage + 2)
  if (start > 2) items.push("ellipsis")
  for (let page = start; page <= end; page += 1) items.push(page)
  if (end < pageCount - 1) items.push("ellipsis")
  items.push(pageCount)
  return items
}

export function ProviderOwnerPortfolioManagement({
  initialPage, summary, canManage, canRegister, filters,
}: {
  initialPage: ProviderOwnerPortfolioPage
  summary: ProviderOwnerSummary
  canManage: boolean
  canRegister: boolean
  filters: OwnerFilters
}) {
  const router = useRouter()
  const [details, setDetails] = useState<ProviderOwnerCustomer | null>(null)
  const [editing, setEditing] = useState<ProviderOwnerCustomer | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [responding, setResponding] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(initialPage.total / initialPage.limit))
  const currentPage = Math.floor(initialPage.offset / initialPage.limit) + 1
  const firstRecord = initialPage.total ? initialPage.offset + 1 : 0
  const lastRecord = Math.min(initialPage.offset + initialPage.items.length, initialPage.total)
  const visiblePages = paginationItems(currentPage, totalPages)
  const hasFilters = Boolean(filters.search || filters.status)

  const loadDetails = async (
    item: ProviderOwnerPortfolioItem,
    mode: "view" | "edit"
  ) => {
    const key = `${item.owner.id}:${mode}`
    setLoadingAction(key)
    try {
      const customer = await parseResponse<ProviderOwnerCustomer>(
        await fetch(`/api/provider/owners/${item.owner.id}`, { cache: "no-store" })
      )
      if (mode === "view") setDetails(customer)
      else setEditing(customer)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load the owner.")
    } finally {
      setLoadingAction(null)
    }
  }

  const respond = async (item: ProviderOwnerCustomer, decision: "approve" | "reject") => {
    const note = decision === "reject" ? window.prompt("Reason for rejecting this owner link:") : null
    if (decision === "reject" && !note?.trim()) return
    setResponding(item.link.id)
    try {
      await parseResponse(
        await fetch(`/api/provider/owners/links/${item.link.id}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, notes: note }),
        })
      )
      toast.success(decision === "approve" ? "Owner link approved" : "Owner link rejected")
      setDetails(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the link.")
    } finally {
      setResponding(null)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              National owner registry
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Vehicle owners</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-100/75 sm:text-base">
              Review provider-linked owners from a lightweight portfolio. Full documents and account details load only when opened.
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Linked owners", value: summary.total, icon: UsersRound },
            { label: "Active customers", value: summary.active, icon: CheckCircle2 },
            { label: "Owner response due", value: summary.pending_owner_approval, icon: UserRound },
            { label: "Provider response due", value: summary.pending_provider_approval, icon: Building2 },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-3 text-3xl font-semibold">{value}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h2 className="font-semibold">Provider owner portfolio</h2>
                <p className="text-sm text-muted-foreground">
                  {firstRecord}–{lastRecord} of {pageData.total} matching owners
                  {loadingPage ? " · Loading..." : ""}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <div className="relative sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search all owners, code, NID, phone..."
                    maxLength={180}
                    aria-label="Search provider vehicle owners"
                    className="pl-9"
                  />
                </div>
                <select
                  value={query.status}
                  aria-label="Filter owner link status"
                  onChange={(event) => setQuery((current) => ({
                    ...current,
                    status: event.target.value,
                    offset: 0,
                  }))}
                  className="h-10 rounded-md border bg-white px-3 text-sm"
                >
                  <option value="all">All link statuses</option>
                  <option value="active">Active</option>
                  <option value="pending_owner_approval">Owner approval due</option>
                  <option value="pending_provider_approval">Provider approval due</option>
                  <option value="rejected">Rejected</option>
                  <option value="suspended">Suspended</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
            </div>

            {pageError ? (
              <Alert variant="destructive" className="m-4 w-auto">
                <AlertTitle>Could not load vehicle owners</AlertTitle>
                <AlertDescription>{pageError}</AlertDescription>
                <Button type="button" variant="outline" size="sm" onClick={refreshCurrentPage}>
                  Retry
                </Button>
              </Alert>
            ) : null}
            {loadingPage ? (
              <div role="status" aria-live="polite" className="flex items-center gap-2 border-b px-6 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading owners from server...
              </div>
            ) : null}

            {pageData.items.length ? (
              <div className="overflow-x-auto" aria-busy={loadingPage}>
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>Owner</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead>Provider link</TableHead>
                      <TableHead className="hidden lg:table-cell">Fleet</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.items.map((item) => (
                      <TableRow key={item.owner.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 font-semibold text-emerald-800">
                              {item.owner.owner_type === "company" ? <Building2 className="size-5" /> : <UserRound className="size-5" />}
                            </div>
                            <div>
                              <p className="font-medium">{item.owner.owner_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.owner.owner_code || "No owner code"} · {item.owner.district || "District unavailable"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><StatusBadge status={item.owner.verification_status} /></TableCell>
                        <TableCell><StatusBadge status={item.link.status} /></TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {item.owner.active_vehicles} active / {item.owner.total_vehicles}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={loadingAction !== null || loadingPage}
                              onClick={() => void loadDetails(item, "view")}
                            >
                              {loadingAction === `${item.owner.id}:view` ? <Loader2 className="animate-spin" /> : null}
                              View
                            </Button>
                            {canManage && item.can_manage ? (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                disabled={loadingAction !== null || loadingPage}
                                onClick={() => void loadDetails(item, "edit")}
                                aria-label="Edit owner"
                              >
                                {loadingAction === `${item.owner.id}:edit` ? <Loader2 className="animate-spin" /> : <Pencil />}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <UsersRound className="size-7" />
                </div>
                <h3 className="mt-4 font-semibold">No matching vehicle owners</h3>
                <p className="mt-1 text-sm text-muted-foreground">Adjust the search and link-status filter.</p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 sm:px-6" aria-label="Owner list pagination">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <label htmlFor="provider-owner-page-size">Rows per page</label>
                <select
                  id="provider-owner-page-size"
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                  value={query.limit}
                  disabled={loadingPage}
                  onChange={(event) => setQuery((current) => ({
                    ...current,
                    offset: 0,
                    limit: Number(event.target.value),
                  }))}
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-2 text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
                <Button size="sm" variant="outline" type="button" disabled={loadingPage || currentPage === 1} onClick={() => navigateToPage(1)}>First</Button>
                <Button size="sm" variant="outline" type="button" disabled={loadingPage || currentPage === 1} onClick={() => navigateToPage(currentPage - 1)}>Previous</Button>
                {visiblePages.map((pageNumber) => (
                  <Button
                    key={pageNumber}
                    size="sm"
                    type="button"
                    variant={pageNumber === currentPage ? "default" : "outline"}
                    aria-current={pageNumber === currentPage ? "page" : undefined}
                    disabled={loadingPage || pageNumber === currentPage}
                    onClick={() => navigateToPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                ))}
                <Button size="sm" variant="outline" type="button" disabled={loadingPage || currentPage === totalPages} onClick={() => navigateToPage(currentPage + 1)}>Next</Button>
                <Button size="sm" variant="outline" type="button" disabled={loadingPage || currentPage === totalPages} onClick={() => navigateToPage(totalPages)}>Last</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <EditOwnerDialog target={editing} onOpenChange={(open) => !open && setEditing(null)} onSaved={refreshCurrentPage} />

      <Dialog open={Boolean(details)} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {details ? (
            <>
              <DialogHeader>
                <DialogTitle>{details.owner.owner_name}</DialogTitle>
                <DialogDescription>
                  {details.owner.application_number} · {details.owner.owner_code}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Owner type", details.owner.owner_type],
                  ["Identity reference", details.owner.identity_or_registration_reference],
                  ["District", details.owner.district],
                  ["Phone", details.owner.phone || "Not provided"],
                  ["Email", details.owner.email || "Not provided"],
                  ["Submitted", formatDate(details.owner.submitted_at)],
                  ["Vehicles", `${details.owner.active_vehicles} active / ${details.owner.total_vehicles}`],
                  ["Drivers", String(details.owner.linked_drivers_count)],
                  ["Account", details.account?.status || details.owner.account_status || "Not available"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-1 break-words text-sm font-medium capitalize">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Registered address</p>
                <p className="mt-1 text-sm">{details.owner.registered_address}</p>
              </div>
              {details.owner.review_notes ? (
                <Alert>
                  <FileText />
                  <AlertTitle>National review notes</AlertTitle>
                  <AlertDescription>{details.owner.review_notes}</AlertDescription>
                </Alert>
              ) : null}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Documents</h3>
                  <Badge variant="secondary">{details.owner.documents.length}</Badge>
                </div>
                <OwnerDocuments documents={details.owner.documents} />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                {canManage && details.link.status === "pending_provider_approval" ? (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => void respond(details, "reject")}
                      disabled={responding === details.link.id}
                    >
                      <XCircle /> Reject link
                    </Button>
                    <Button
                      className="bg-emerald-800 text-white hover:bg-emerald-900"
                      onClick={() => void respond(details, "approve")}
                      disabled={responding === details.link.id}
                    >
                      {responding === details.link.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                      Approve link
                    </Button>
                  </>
                ) : null}
                {canManage && details.can_manage ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(details)
                      setDetails(null)
                    }}
                  >
                    <Pencil /> Edit owner
                  </Button>
                ) : null}
                <Button onClick={() => setDetails(null)}>Close</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
