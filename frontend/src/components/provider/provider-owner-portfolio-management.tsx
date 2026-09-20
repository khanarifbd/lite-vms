"use client"

import { Building2, ChevronLeft, ChevronRight, Pencil, Plus, Search, UserRound, UsersRound } from "lucide-react"
import Link from "next/link"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ProviderOwnerPortfolioPage, ProviderOwnerSummary } from "@/features/provider/owner-types"

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
  const totalPages = Math.max(1, Math.ceil(initialPage.total / initialPage.limit))
  const currentPage = Math.floor(initialPage.offset / initialPage.limit) + 1
  const firstRecord = initialPage.total ? initialPage.offset + 1 : 0
  const lastRecord = Math.min(initialPage.offset + initialPage.items.length, initialPage.total)
  const visiblePages = paginationItems(currentPage, totalPages)
  const hasFilters = Boolean(filters.search || filters.status)

  return (
    <div>
        <Card>
          <CardHeader className="space-y-0 border-b px-4 py-4 sm:px-5">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <CardTitle>Vehicle owner portfolio</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {initialPage.total} matching owner record{initialPage.total === 1 ? "" : "s"} linked to this provider.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{summary.active} active</Badge>
                <Badge variant="outline">{summary.pending_provider_approval} pending your approval</Badge>
                {canRegister ? (
                  <Button asChild size="sm">
                    <Link href="/provider/owners/register"><Plus /> Register or link owner</Link>
                  </Button>
                ) : null}
              </div>
            </div>
            <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(220px,1fr)_220px_145px_auto_auto]" method="get">
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9"
                  defaultValue={filters.search}
                  name="search"
                  maxLength={180}
                  aria-label="Search provider vehicle owners"
                  placeholder="Owner name, code, NID, phone..."
                />
              </div>
              <select
                aria-label="Owner link status"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                defaultValue={filters.status}
                name="status"
              >
                <option value="">All link statuses</option>
                {linkStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select
                aria-label="Owners per page"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                defaultValue={filters.limit}
                name="limit"
              >
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}
              </select>
              <Button className="h-9" type="submit">Apply</Button>
              {hasFilters ? (
                <Button asChild className="h-9" type="button" variant="outline">
                  <Link href="/provider/owners">Clear</Link>
                </Button>
              ) : null}
            </form>
            <div className="mt-3 flex flex-col gap-2 border-t pt-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-muted-foreground sm:text-sm">
                Showing <span className="font-medium text-foreground">{firstRecord}–{lastRecord}</span> of{" "}
                <span className="font-medium text-foreground">{initialPage.total}</span>
                <span className="mx-2 text-slate-300">|</span>
                Page <span className="font-medium text-foreground">{currentPage}</span> of{" "}
                <span className="font-medium text-foreground">{totalPages}</span>
              </p>
              <nav aria-label="Owner pagination" className="flex flex-wrap items-center gap-1">
                {currentPage > 1 ? (
                  <Button asChild className="h-8 px-2" size="sm" variant="outline">
                    <Link href={ownerPageHref(currentPage - 1, filters)} aria-label="Previous page">
                      <ChevronLeft aria-hidden="true" className="size-4" />
                      <span className="hidden sm:inline">Previous</span>
                    </Link>
                  </Button>
                ) : (
                  <Button className="h-8 px-2" disabled size="sm" variant="outline">
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </Button>
                )}
                {visiblePages.map((item, index) =>
                  item === "ellipsis" ? (
                    <span key={`ellipsis-${index}`} className="flex h-8 min-w-7 items-center justify-center px-1 text-sm text-muted-foreground">…</span>
                  ) : item === currentPage ? (
                    <Button key={item} aria-current="page" className="h-8 min-w-8 px-2" disabled size="sm">{item}</Button>
                  ) : (
                    <Button key={item} asChild className="h-8 min-w-8 px-2" size="sm" variant="outline">
                      <Link href={ownerPageHref(item, filters)}>{item}</Link>
                    </Button>
                  )
                )}
                {currentPage < totalPages ? (
                  <Button asChild className="h-8 px-2" size="sm" variant="outline">
                    <Link href={ownerPageHref(currentPage + 1, filters)} aria-label="Next page">
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button className="h-8 px-2" disabled size="sm" variant="outline">
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Button>
                )}
              </nav>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            {initialPage.items.length ? (
              <div className="overflow-x-auto" >
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
                    {initialPage.items.map((item) => (
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
                              asChild
                            >
                              <Link href={`/provider/owners/${item.owner.id}`}>View</Link>
                            </Button>
                            {canManage && item.can_manage ? (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                asChild
                              >
                                <Link href={`/provider/owners/${item.owner.id}/edit`} aria-label="Edit owner"><Pencil /></Link>
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
          </CardContent>
        </Card>
      </div>

  )
}
