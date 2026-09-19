import { LockKeyhole, ShieldAlert, UsersRound } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { ProviderOwnerPortfolioManagement } from "@/components/provider/provider-owner-portfolio-management"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type {
  ProviderOwnerPortfolioPage,
  ProviderOwnerSummary,
} from "@/features/provider/owner-types"
import { USER_ROLES, userHasAnyRole, userHasRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import {
  getProviderOwnerPortfolio,
  getProviderOwnerSummary,
} from "@/lib/provider/owner-server"
import { getMyProviderApplication } from "@/lib/provider/server"

export const dynamic = "force-dynamic"

const ownerReadRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsViewer,
] as const

type SearchValue = string | string[] | undefined

const pageSizes = [10, 25, 50, 100] as const
const linkStatuses = [
  "active",
  "pending_owner_approval",
  "pending_provider_approval",
  "rejected",
  "suspended",
  "ended",
] as const

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value
}

function ownerPageHref(page: number, filters: { search: string; status: string; limit: number }) {
  const params = new URLSearchParams()
  if (page > 1) params.set("page", String(page))
  if (filters.search) params.set("search", filters.search)
  if (filters.status) params.set("status", filters.status)
  if (filters.limit !== 25) params.set("limit", String(filters.limit))
  const query = params.toString()
  return query ? `/provider/owners?${query}` : "/provider/owners"
}

type ProviderOwnersPageProps = {
  searchParams: Promise<{
    page?: SearchValue
    search?: SearchValue
    status?: SearchValue
    limit?: SearchValue
  }>
}

export default async function ProviderOwnersPage({ searchParams }: ProviderOwnersPageProps) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, ownerReadRoles)) redirect("/provider/dashboard")

  let application = null
  try {
    application = await getMyProviderApplication()
  } catch {
    redirect("/provider/application")
  }
  if (!application) redirect("/provider/application")

  if (application.status !== "approved") {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <LockKeyhole />
            <AlertTitle>Vehicle-owner operations are locked</AlertTitle>
            <AlertDescription>
              Bangladesh Police must approve the VTS provider before customer owners can be registered, linked, or managed.
            </AlertDescription>
          </Alert>
          <Card>
            <CardContent className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                <UsersRound className="size-8" aria-hidden="true" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold">Provider approval required</h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Current application status: {application.status.replaceAll("_", " ")}.
                Vehicle-owner access will unlock automatically after approval.
              </p>
              <Button asChild className="mt-6 bg-emerald-800 text-white hover:bg-emerald-900">
                <Link href="/provider/dashboard">Return to provider dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const params = await searchParams
  const search = (firstValue(params.search) || "").trim().slice(0, 180)
  const rawStatus = firstValue(params.status) || ""
  const status = linkStatuses.includes(rawStatus as (typeof linkStatuses)[number]) ? rawStatus : ""
  const requestedLimit = Number(firstValue(params.limit))
  const limit = pageSizes.includes(requestedLimit as (typeof pageSizes)[number])
    ? requestedLimit : 25
  const requestedPage = Number(firstValue(params.page))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const filters = { search, status, limit }

  let summary: ProviderOwnerSummary | null = null
  let owners: ProviderOwnerPortfolioPage | null = null
  let loadError: string | null = null
  try {
    ;[summary, owners] = await Promise.all([
      getProviderOwnerSummary(),
      getProviderOwnerPortfolio({ page, limit, search, status }),
    ])
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The provider owner registry is currently unavailable."
  }

  if (!summary || !owners) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load vehicle owners</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  const pageCount = Math.max(1, Math.ceil(owners.total / limit))
  if (page > pageCount) redirect(ownerPageHref(pageCount, filters))

  const canRegister = userHasRole(user, USER_ROLES.vtsAdmin)
  return (
    <div className="px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
      <div className="mx-auto max-w-7xl">
        <ProviderOwnerPortfolioManagement
          initialPage={owners}
          summary={summary}
          canRegister={canRegister}
          filters={filters}
          canManage={userHasAnyRole(user, [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator])}
        />
      </div>
    </div>
  )
}
