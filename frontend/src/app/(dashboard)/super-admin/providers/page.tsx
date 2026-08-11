import { Building2, ChevronLeft, ChevronRight, Search } from "lucide-react"
import Link from "next/link"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { ListViewToggle, type RegistryViewMode } from "@/components/super-admin/list-view-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getAdminProviders } from "@/features/super-admin/provider-review"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 20
const statuses = ["pending", "under_review", "approved", "rejected", "suspended"]
type SearchValue = string | string[] | undefined
type Props = { searchParams: Promise<{ search?: SearchValue; status?: SearchValue; page?: SearchValue; view?: SearchValue }> }

function first(value: SearchValue) { return Array.isArray(value) ? value[0] : value }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()) }
function pageHref(page: number, search: string, status: string, view: RegistryViewMode) {
  const params = new URLSearchParams()
  if (page > 1) params.set("page", String(page))
  if (search) params.set("search", search)
  if (status) params.set("status", status)
  if (view === "grid") params.set("view", "grid")
  const query = params.toString()
  return query ? `/super-admin/providers?${query}` : "/super-admin/providers"
}

export default async function SuperAdminProvidersPage({ searchParams }: Props) {
  const query = await searchParams
  const search = first(query.search)?.trim() || ""
  const requestedStatus = first(query.status)?.trim() || ""
  const status = statuses.includes(requestedStatus) ? requestedStatus : ""
  const view: RegistryViewMode = first(query.view) === "grid" ? "grid" : "list"
  const parsedPage = Number.parseInt(first(query.page) || "1", 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const data = await getAdminProviders({ search, status, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE })
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit))
  const hasPrevious = data.offset > 0
  const hasNext = data.offset + data.items.length < data.total

  return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1500px] space-y-6">
    <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10"><div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" /><div className="relative max-w-3xl"><Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">VTS provider oversight</Badge><h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Provider review workspace</h1><p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">Review applications, documents, account state, staff footprint, integration health, and connected-owner operations.</p></div></section>
    <Card><CardHeader className="border-b"><div className="flex items-end justify-between gap-4"><div><CardTitle>VTS providers</CardTitle><p className="mt-1 text-sm text-muted-foreground">{data.total} matching provider records.</p></div><ListViewToggle value={view} /></div><form method="get" className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]"><input type="hidden" name="view" value={view === "grid" ? "grid" : ""} /><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input name="search" defaultValue={search} placeholder="Provider, code, licence, email, or mobile" className="pl-9" /></div><select name="status" defaultValue={status} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><Button type="submit">Apply filters</Button>{search || status ? <Button asChild type="button" variant="outline"><Link href={view === "grid" ? "/super-admin/providers?view=grid" : "/super-admin/providers"}>Clear</Link></Button> : null}</form></CardHeader>
    <CardContent className="p-4 sm:p-6">{data.items.length ? <div className={view === "grid" ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>{data.items.map((provider) => <article key={provider.id} className="rounded-2xl border bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"><div className={view === "list" ? "flex flex-col gap-4 xl:flex-row xl:items-center" : ""}><div className="flex flex-1 items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><Building2 className="size-5" /></div><div className="min-w-0"><Link href={`/super-admin/providers/${provider.id}`} className="truncate text-lg font-semibold hover:text-emerald-800">{provider.legal_name}</Link><p className="mt-1 text-xs text-muted-foreground">{provider.code} · {provider.application_number}</p></div></div><StatusBadge status={provider.status} /></div><div className={view === "list" ? "grid flex-1 gap-3 sm:grid-cols-3" : "mt-5 grid gap-3 sm:grid-cols-3"}><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Staff</p><p className="mt-1 font-semibold">{provider.provider_staff_count}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Owners</p><p className="mt-1 font-semibold">{provider.linked_owner_count}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Online vehicles</p><p className="mt-1 font-semibold">{provider.online_vehicle_count}/{provider.active_vehicle_count}</p></div></div><div className={view === "list" ? "flex min-w-72 items-center justify-between gap-3 xl:border-l xl:pl-4" : "mt-4 flex items-center justify-between border-t pt-4"}><div className="flex flex-wrap gap-2"><Badge variant="outline">{provider.district}</Badge><Badge variant="outline">Integration {label(provider.telemetry_source_status || provider.integration_status || "pending")}</Badge></div><Button asChild size="sm" className="bg-emerald-800 text-white hover:bg-emerald-900"><Link href={`/super-admin/providers/${provider.id}`}>Open review</Link></Button></div></div></article>)}</div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 text-center"><Building2 className="size-8 text-emerald-700" /><h2 className="mt-3 font-semibold">No providers found</h2><p className="mt-1 text-sm text-muted-foreground">Change or clear the current filters.</p></div>}
    {data.total > 0 ? <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t pt-5 sm:flex-row"><p className="text-sm text-muted-foreground">Page {page} of {pageCount}</p><div className="flex gap-2"><Button asChild={hasPrevious} disabled={!hasPrevious} variant="outline">{hasPrevious ? <Link href={pageHref(page - 1, search, status, view)}><ChevronLeft /> Previous</Link> : <span><ChevronLeft /> Previous</span>}</Button><Button asChild={hasNext} disabled={!hasNext} variant="outline">{hasNext ? <Link href={pageHref(page + 1, search, status, view)}>Next <ChevronRight /></Link> : <span>Next <ChevronRight /></span>}</Button></div></div> : null}</CardContent></Card>
  </div></div>
}
