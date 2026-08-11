import { CarFront, CheckCircle2, ChevronRight, Eye, Plus, Search, ShieldAlert } from "lucide-react"
import Link from "next/link"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { OwnerVehicle, OwnerVehiclePage } from "@/features/owner/types"
import { getMyVehicles } from "@/lib/owner/server"

export const dynamic = "force-dynamic"

const DEFAULT_PAGE_SIZE = 25
const pageSizes = [10, 25, 50, 100] as const
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

type SearchValue = string | string[] | undefined
type Props = {
  searchParams: Promise<{
    cursor?: SearchValue
    limit?: SearchValue
    search?: SearchValue
    status?: SearchValue
    documents?: SearchValue
    registration?: SearchValue
  }>
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

function shortDate(value: string | null) {
  if (!value) return "Not set"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "Not set"
    : new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" }).format(date)
}

function documentStatusLabel(vehicle: OwnerVehicle) {
  if (vehicle.document_status === "required") {
    return `${vehicle.missing_documents.length} document${vehicle.missing_documents.length === 1 ? "" : "s"} required`
  }
  if (vehicle.document_days_remaining === null) return "Not available"
  if (vehicle.document_days_remaining < 0) {
    return `Expired ${Math.abs(vehicle.document_days_remaining)} days ago`
  }
  return `${vehicle.document_days_remaining} days left`
}

function pageHref(
  cursor: string,
  filters: { search: string; status: string; limit: number; documentStatus: string }
) {
  const params = new URLSearchParams()
  if (cursor) params.set("cursor", cursor)
  if (filters.search) params.set("search", filters.search)
  if (filters.status) params.set("status", filters.status)
  if (filters.documentStatus) params.set("documents", filters.documentStatus)
  if (filters.limit !== DEFAULT_PAGE_SIZE) params.set("limit", String(filters.limit))
  const query = params.toString()
  return query ? `/owner/vehicles?${query}` : "/owner/vehicles"
}

export default async function OwnerVehiclesPage({ searchParams }: Props) {
  const params = await searchParams
  const search = firstValue(params.search)?.trim() || ""
  const requestedStatus = firstValue(params.status)?.trim() || ""
  const status = verificationStatuses.includes(requestedStatus as (typeof verificationStatuses)[number])
    ? requestedStatus
    : ""
  const requestedDocumentStatus = firstValue(params.documents) || ""
  const documentStatus: "" | "required" | "expired" | "expiring" = ["required", "expired", "expiring"].includes(requestedDocumentStatus)
    ? (requestedDocumentStatus as "required" | "expired" | "expiring")
    : ""
  const requestedLimit = Number(firstValue(params.limit))
  const limit = pageSizes.includes(requestedLimit as (typeof pageSizes)[number])
    ? requestedLimit
    : DEFAULT_PAGE_SIZE
  const cursor = firstValue(params.cursor) || ""
  const registrationResult = firstValue(params.registration)?.trim() || ""

  let vehicles: OwnerVehiclePage | null = null
  let loadError: string | null = null
  try {
    vehicles = await getMyVehicles({
      cursor,
      limit,
      search,
      status,
      documentStatus: documentStatus || undefined,
    })
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The vehicle registry is unavailable."
  }

  if (!vehicles) {
    return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-4xl"><Alert variant="destructive"><ShieldAlert /><AlertTitle>Unable to load owner vehicles</AlertTitle><AlertDescription>{loadError || "Vehicle data is unavailable."}</AlertDescription></Alert></div></div>
  }

  const hasNextPage = Boolean(vehicles.next_cursor)
  const hasFilters = Boolean(search || status || documentStatus)
  const filters = { search, status, limit, documentStatus }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {registrationResult === "submitted" ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 /><AlertTitle>Vehicle submitted for review</AlertTitle><AlertDescription>The registration now appears in your workspace.</AlertDescription></Alert> : null}

        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div><CardTitle>My vehicle portfolio</CardTitle><p className="mt-1 text-sm text-muted-foreground">{vehicles.total} matching vehicle record{vehicles.total === 1 ? "" : "s"} in your owner account.</p></div>
              <div className="flex items-center gap-2"><Badge variant="secondary">{vehicles.stats.verified} verified</Badge><Button asChild size="sm"><Link href="/owner/vehicles/register"><Plus /> Register vehicle</Link></Button></div>
            </div>

            <form className="mt-4 grid gap-3 xl:grid-cols-[minmax(260px,1fr)_210px_170px_190px_auto_auto]" method="get">
              <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" defaultValue={search} name="search" placeholder="Registration, chassis, engine, brand, or model" /></div>
              <select aria-label="Verification status" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" defaultValue={status} name="status"><option value="">All verification statuses</option>{verificationStatuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select>
              <select aria-label="Vehicles per page" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" defaultValue={limit} name="limit">{pageSizes.map((size) => <option key={size} value={size}>{size} per page</option>)}</select>
              <select aria-label="Document compliance" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" defaultValue={documentStatus} name="documents"><option value="">All documents</option><option value="required">Documents required</option><option value="expired">Any document expired</option><option value="expiring">Expiring within 30 days</option></select>
              <Button type="submit">Apply</Button>
              {hasFilters ? <Button asChild type="button" variant="outline"><Link href="/owner/vehicles">Clear</Link></Button> : null}
            </form>
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            {vehicles.items.length ? <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1010px] border-collapse text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Vehicle name</th><th className="px-4 py-3 font-medium">Registration no.</th><th className="px-4 py-3 font-medium">Vehicle type</th><th className="px-4 py-3 font-medium">Verification</th><th className="px-4 py-3 font-medium">Documents</th><th className="px-4 py-3 font-medium">Certificate</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Action</th></tr></thead><tbody className="divide-y">
              {vehicles.items.map((vehicle) => { const vehicleHref = `/owner/vehicles/${vehicle.id}`; return <tr key={vehicle.id} className="transition-colors hover:bg-slate-50"><td className="px-4 py-3"><Link href={vehicleHref} className="block max-w-56 truncate font-semibold hover:text-primary hover:underline">{vehicle.registration_number_display || vehicle.registration_number}</Link><p className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">{[vehicle.brand, vehicle.model].filter(Boolean).join(" · ") || "Imported vehicle"}</p></td><td className="px-4 py-3 font-medium text-slate-700">{vehicle.registration_number.startsWith("GOMAX-") ? "To be updated" : vehicle.registration_number}</td><td className="px-4 py-3 text-muted-foreground">{vehicle.vehicle_type}</td><td className="px-4 py-3"><StatusBadge status={vehicle.verification_status} /></td><td className="px-4 py-3"><p className={vehicle.document_status === "required" || vehicle.document_status === "expired" ? "font-medium text-rose-700" : vehicle.document_status === "expiring" ? "font-medium text-amber-700" : "font-medium text-emerald-700"}>{documentStatusLabel(vehicle)}</p>{vehicle.document_status !== "valid" ? <Link href={`${vehicleHref}/documents`} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">Add documents</Link> : null}</td><td className="px-4 py-3">{vehicle.certificate_number ? <><p className="font-medium text-emerald-800">Issued {shortDate(vehicle.certificate_issued_at)}</p><p className="mt-0.5 text-xs text-muted-foreground">Expires {shortDate(vehicle.certificate_expires_at)}</p></> : <Link href={`${vehicleHref}/certificate`} className="text-xs font-medium text-primary hover:underline">Not issued</Link>}</td><td className="px-4 py-3"><Badge variant="outline">{statusLabel(vehicle.status)}</Badge></td><td className="px-4 py-3 text-right"><Button asChild size="sm" variant="outline"><Link href={vehicleHref}><Eye /> View</Link></Button></td></tr> })}
            </tbody></table></div> : <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 px-6 text-center"><div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><CarFront aria-hidden="true" className="size-7" /></div><h2 className="mt-4 text-lg font-semibold">{hasFilters ? "No matching vehicles" : "No vehicles registered"}</h2><p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{hasFilters ? "Change or clear the filters to view other vehicle records." : "Add your first vehicle to start managing it here."}</p>{!hasFilters ? <Button asChild className="mt-5"><Link href="/owner/vehicles/register"><Plus /> Add first vehicle</Link></Button> : null}</div>}
            {vehicles.total > 0 ? <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t pt-5 sm:flex-row"><p className="text-sm text-muted-foreground">Showing {vehicles.items.length} record{vehicles.items.length === 1 ? "" : "s"}</p><Button asChild={hasNextPage} disabled={!hasNextPage} variant="outline">{hasNextPage ? <Link href={pageHref(vehicles.next_cursor || "", filters)}>Next <ChevronRight aria-hidden="true" /></Link> : <span>Next <ChevronRight aria-hidden="true" /></span>}</Button></div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
