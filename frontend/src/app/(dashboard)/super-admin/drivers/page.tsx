import { ChevronLeft, ChevronRight, Gauge, History, Search } from "lucide-react"
import Link from "next/link"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { ListViewToggle, type RegistryViewMode } from "@/components/super-admin/list-view-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getAdminDrivers } from "@/features/super-admin/drivers"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 20
const statuses = ["pending", "under_review", "verified", "changes_requested", "rejected", "suspended"]
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
  return query ? `/super-admin/drivers?${query}` : "/super-admin/drivers"
}

export default async function SuperAdminDriversPage({ searchParams }: Props) {
  const query = await searchParams
  const search = first(query.search)?.trim() || ""
  const requestedStatus = first(query.status)?.trim() || ""
  const status = statuses.includes(requestedStatus) ? requestedStatus : ""
  const view: RegistryViewMode = first(query.view) === "grid" ? "grid" : "list"
  const parsedPage = Number.parseInt(first(query.page) || "1", 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const data = await getAdminDrivers({ search, status, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE })
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit))
  const hasPrevious = data.offset > 0
  const hasNext = data.offset + data.items.length < data.total

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">National driver registry</Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Driver oversight workspace</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">Search and inspect registered drivers, licence status, current assignments, connected owners and VTS providers, documents, and verification state.</p>
            </div>
            <Button asChild className="w-fit bg-white text-emerald-950 hover:bg-emerald-50">
              <Link href="/super-admin/drivers/duty-history"><History /> Duty history</Link>
            </Button>
          </div>
        </section>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-end justify-between gap-4">
              <div><CardTitle>Drivers</CardTitle><p className="mt-1 text-sm text-muted-foreground">{data.total} matching driver records.</p></div>
              <ListViewToggle value={view} />
            </div>
            <form method="get" className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
              <input type="hidden" name="view" value={view === "grid" ? "grid" : ""} />
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input name="search" defaultValue={search} placeholder="Name, code, mobile, email, NID, or licence" className="pl-9" /></div>
              <select name="status" defaultValue={status} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
              <Button type="submit">Apply filters</Button>
              {search || status ? <Button asChild type="button" variant="outline"><Link href={view === "grid" ? "/super-admin/drivers?view=grid" : "/super-admin/drivers"}>Clear</Link></Button> : null}
            </form>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {data.items.length ? (
              <div className={view === "grid" ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
                {data.items.map((driver) => (
                  <article key={driver.id} className="rounded-2xl border bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md">
                    <div className={view === "list" ? "flex flex-col gap-4 xl:flex-row xl:items-center" : ""}>
                      <div className="flex flex-1 items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800"><Gauge className="size-5" /></div><div className="min-w-0"><Link href={`/super-admin/drivers/${driver.id}`} className="truncate text-lg font-semibold hover:text-emerald-800">{driver.full_name}</Link><p className="mt-1 text-xs text-muted-foreground">{driver.driver_code} · {driver.mobile}</p></div></div>
                        <StatusBadge status={driver.verification_status} />
                      </div>
                      <div className={view === "list" ? "grid flex-1 gap-3 sm:grid-cols-3" : "mt-5 grid gap-3 sm:grid-cols-3"}>
                        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Licence</p><p className="mt-1 truncate font-semibold">{driver.licence.licence_number}</p></div>
                        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Current vehicle</p><p className="mt-1 truncate font-semibold">{driver.current_vehicle_registration || "Not assigned"}</p></div>
                        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Behaviour</p><p className="mt-1 font-semibold">{Math.round(driver.behaviour_score)}%</p></div>
                      </div>
                      <div className={view === "list" ? "flex min-w-72 items-center justify-between gap-3 xl:border-l xl:pl-4" : "mt-4 flex items-center justify-between border-t pt-4"}>
                        <div className="flex flex-wrap gap-2"><Badge variant="outline">{driver.district}</Badge><Badge variant="outline">{label(driver.licence.licence_type)}</Badge></div>
                        <Button asChild size="sm" className="bg-emerald-800 text-white hover:bg-emerald-900"><Link href={`/super-admin/drivers/${driver.id}`}>Open record</Link></Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 text-center"><Gauge className="size-8 text-emerald-700" /><h2 className="mt-3 font-semibold">No drivers found</h2><p className="mt-1 text-sm text-muted-foreground">Change or clear the current filters.</p></div>
            )}
            {data.total > 0 ? <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t pt-5 sm:flex-row"><p className="text-sm text-muted-foreground">Page {page} of {pageCount}</p><div className="flex gap-2"><Button asChild={hasPrevious} disabled={!hasPrevious} variant="outline">{hasPrevious ? <Link href={pageHref(page - 1, search, status, view)}><ChevronLeft /> Previous</Link> : <span><ChevronLeft /> Previous</span>}</Button><Button asChild={hasNext} disabled={!hasNext} variant="outline">{hasNext ? <Link href={pageHref(page + 1, search, status, view)}>Next <ChevronRight /></Link> : <span>Next <ChevronRight /></span>}</Button></div></div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
