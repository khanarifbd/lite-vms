import { LockKeyhole, Plus, ShieldAlert, UsersRound } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { ProviderOwnerManagement } from "@/components/provider/provider-owner-management"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type {
  ProviderOwnerPage,
  ProviderOwnerSummary,
} from "@/features/provider/owner-types"
import { USER_ROLES, userHasAnyRole, userHasRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import {
  getProviderOwners,
  getProviderOwnerSummary,
} from "@/lib/provider/owner-server"
import { getMyProviderApplication } from "@/lib/provider/server"

export const dynamic = "force-dynamic"

const ownerReadRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsViewer,
] as const

export default async function ProviderOwnersPage() {
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

  let summary: ProviderOwnerSummary | null = null
  let owners: ProviderOwnerPage | null = null
  let loadError: string | null = null
  try {
    ;[summary, owners] = await Promise.all([getProviderOwnerSummary(), getProviderOwners()])
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

  const canRegister = userHasRole(user, USER_ROLES.vtsAdmin)
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-4">
        {canRegister ? (
          <div className="flex justify-end">
            <Button asChild className="bg-emerald-800 text-white hover:bg-emerald-900">
              <Link href="/provider/owners/register"><Plus /> Register or link owner</Link>
            </Button>
          </div>
        ) : null}
        <ProviderOwnerManagement
          initialPage={owners}
          summary={summary}
          canRegister={false}
          canManage={userHasAnyRole(user, [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator])}
        />
      </div>
    </div>
  )
}
