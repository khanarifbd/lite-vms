import {
  ArrowLeft,
  CalendarRange,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getAdminDriverDutyHistory } from "@/features/super-admin/drivers"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50
type SearchValue = string | string[] | undefined
type Props = {
  searchParams: Promise<{
    search?: SearchValue
    driver_id?: SearchValue
    from?: SearchValue
    to?: SearchValue
    page?: SearchValue
  }>
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Dhaka",
})

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value
}

function filterBoundary(value: string, endOfDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const suffix = endOfDay ? "T23:59:59.999+06:00" : "T00:00:00+06:00"
  const date = new Date(`${value}${suffix}`)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function formatDateTime(value: string | null) {
  if (!value) return "Open"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateTimeFormatter.format(date)
}

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.floor(seconds / 60))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60
  if (days) return `${days}d ${hours}h ${remainingMinutes}m`
  if (hours) return `${hours}h ${remainingMinutes}m`
  return `${remainingMinutes}m`
}

function pageHref(input: {
  page: number
  search: string
  driverId: string
  from: string
  to: string
}) {
  const params = new URLSearchParams()
  if (input.page > 1) params.set("page", String(input.page))
  if (input.search) params.set("search", input.search)
  if (input.driverId) params.set("driver_id", input.driverId)
  if (input.from) params.set("from", input.from)
  if (input.to) params.set("to", input.to)
  const query = params.toString()
  return query
    ? `/super-admin/drivers/duty-history?${query}`
    : "/super-admin/drivers/duty-history"
}

export default async function SuperAdminDutyHistoryPage({
  searchParams,
}: Props) {
  const query = await searchParams
  const search = first(query.search)?.trim() || ""
  const driverId = first(query.driver_id)?.trim() || ""
  const from = first(query.from)?.trim() || ""
  const to = first(query.to)?.trim() || ""
  const parsedPage = Number.parseInt(first(query.page) || "1", 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  const data = await getAdminDriverDutyHistory({
    search,
    driverId,
    fromAt: filterBoundary(from, false),
    toAt: filterBoundary(to, true),
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  })
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit))
  const hasPrevious = data.offset > 0
  const hasNext = data.offset + data.items.length < data.total

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <Button asChild variant="ghost" className="-ml-3">
          <Link href="/super-admin/drivers"><ArrowLeft /> Back to drivers</Link>
        </Button>

        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative max-w-4xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              <ShieldCheck className="size-3.5" /> Evidentiary duty ledger
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Driver duty-time history
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-emerald-100/75">
              Identify exactly which Driver was operating a Vehicle at any date and time.
              Owner disconnection, roster removal, and account suspension never erase these records.
            </p>
          </div>
        </section>

        <Card>
          <CardHeader className="border-b">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="size-5 text-emerald-700" /> Search duty intervals
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Search by Driver name/code or Vehicle registration, then narrow by Bangladesh date.
              </p>
            </div>
            <form
              method="get"
              className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px_auto_auto]"
            >
              {driverId ? <input type="hidden" name="driver_id" value={driverId} /> : null}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={search}
                  placeholder="Driver name/code or Vehicle registration"
                  className="pl-9"
                />
              </div>
              <Input name="from" type="date" defaultValue={from} aria-label="From date" />
              <Input name="to" type="date" defaultValue={to} aria-label="To date" />
              <Button type="submit"><Search /> Apply filters</Button>
              {search || from || to || driverId ? (
                <Button asChild type="button" variant="outline">
                  <Link href="/super-admin/drivers/duty-history">Clear</Link>
                </Button>
              ) : null}
            </form>
            {driverId ? (
              <Badge variant="outline" className="mt-3 w-fit">
                Exact Driver scope enabled
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {data.total} duty session{data.total === 1 ? "" : "s"} found
              </p>
              <Badge variant="outline">Page {page} of {pageCount}</Badge>
            </div>

            {data.items.length ? (
              <div className="space-y-3">
                {data.items.map((item) => (
                  <article
                    key={item.id}
                    className="grid gap-4 rounded-2xl border bg-white p-4 shadow-sm xl:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(300px,1.4fr)_140px_minmax(220px,1fr)] xl:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-800">
                        <UserRound className="size-4.5" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/super-admin/drivers/${item.driver_id}`}
                          className="truncate font-semibold hover:text-emerald-800"
                        >
                          {item.driver_name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{item.driver_code}</p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-3">
                      <CarFront className="size-5 shrink-0 text-emerald-700" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Vehicle</p>
                        <p className="truncate font-semibold">{item.vehicle_registration}</p>
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Started</p>
                        <p className="font-medium">{formatDateTime(item.started_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Ended</p>
                        <p className="font-medium">{formatDateTime(item.ended_at)}</p>
                      </div>
                    </div>
                    <div>
                      <Badge
                        variant={item.is_open ? "default" : "secondary"}
                        className={item.is_open ? "bg-emerald-700 text-white" : ""}
                      >
                        {item.is_open ? "On duty" : "Ended"}
                      </Badge>
                      <p className="mt-2 flex items-center gap-1.5 font-semibold">
                        <Clock3 className="size-3.5" /> {formatDuration(item.duration_seconds)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Recorded reason</p>
                      <p className="mt-1 line-clamp-2 text-sm">
                        {item.end_reason || item.start_reason}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 text-center">
                <Clock3 className="size-8 text-emerald-700" />
                <h2 className="mt-3 font-semibold">No duty sessions found</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Change the Driver, Vehicle, or date filters.
                </p>
              </div>
            )}

            {data.total > 0 ? (
              <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
                <p className="text-sm text-muted-foreground">
                  Showing {data.offset + 1}–{data.offset + data.items.length} of {data.total}
                </p>
                <div className="flex gap-2">
                  <Button asChild={hasPrevious} disabled={!hasPrevious} variant="outline">
                    {hasPrevious ? (
                      <Link href={pageHref({ page: page - 1, search, driverId, from, to })}>
                        <ChevronLeft /> Previous
                      </Link>
                    ) : <span><ChevronLeft /> Previous</span>}
                  </Button>
                  <Button asChild={hasNext} disabled={!hasNext} variant="outline">
                    {hasNext ? (
                      <Link href={pageHref({ page: page + 1, search, driverId, from, to })}>
                        Next <ChevronRight />
                      </Link>
                    ) : <span>Next <ChevronRight /></span>}
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
