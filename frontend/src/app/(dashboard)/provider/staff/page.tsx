import { LockKeyhole, ShieldAlert, UsersRound } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { ProviderStaffManagement } from "@/components/provider/provider-staff-management"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ProviderStaffPage as ProviderStaffPageData } from "@/features/provider/staff-types"
import { USER_ROLES, userHasRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyProviderApplication } from "@/lib/provider/server"
import { getProviderStaff } from "@/lib/provider/staff-server"

export const dynamic = "force-dynamic"

export default async function ProviderStaffPage() {
  const user = await getAuthenticatedUser()
  if (!user) {
    redirect("/login")
  }
  if (!userHasRole(user, USER_ROLES.vtsAdmin)) {
    redirect("/provider/dashboard")
  }

  let application
  try {
    application = await getMyProviderApplication()
  } catch {
    redirect("/provider/application")
  }

  if (!application) {
    redirect("/provider/application")
  }

  if (application.status !== "approved") {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <LockKeyhole />
            <AlertTitle>Staff management is locked</AlertTitle>
            <AlertDescription>
              Bangladesh Police must approve the VTS provider application before staff
              accounts and operational roles can be created.
            </AlertDescription>
          </Alert>

          <Card>
            <CardContent className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                <UsersRound className="size-8" aria-hidden="true" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold">Approval required</h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Current application status: {application.status.replaceAll("_", " ")}.
                Staff access will unlock automatically after approval.
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

  let staff: ProviderStaffPageData | null = null
  let loadError: string | null = null

  try {
    staff = await getProviderStaff()
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "The provider staff service is currently unavailable."
  }

  if (!staff) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load provider staff</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <ProviderStaffManagement
          initialData={staff}
          providerName={application.legal_name}
        />
      </div>
    </div>
  )
}
