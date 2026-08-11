import { ArrowLeft, CarFront, LockKeyhole } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import {
  ProviderVehicleRegistrationForm,
  type ProviderVehicleOwnerOption,
} from "@/components/provider/provider-vehicle-registration-form"
import { GoMaxVehicleImport } from "@/components/provider/gomax-vehicle-import"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getActiveProviderOwners } from "@/lib/provider/owner-server"
import { getMyProviderApplication } from "@/lib/provider/server"

export const dynamic = "force-dynamic"

const registrationRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator] as const

export default async function ProviderVehicleRegistrationPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, registrationRoles)) redirect("/provider/vehicles")

  const application = await getMyProviderApplication()
  if (!application) redirect("/provider/application")

  if (application.status !== "approved") {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <LockKeyhole />
            <AlertTitle>Vehicle registration is locked</AlertTitle>
            <AlertDescription>
              Bangladesh Police must approve the VTS provider before Admin or Operator users can
              register customer vehicles.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href="/provider/vehicles"><ArrowLeft /> Return to vehicle registry</Link>
          </Button>
        </div>
      </div>
    )
  }

  let owners: ProviderVehicleOwnerOption[] = []
  let ownerLoadError: string | null = null
  try {
    const result = await getActiveProviderOwners()
    owners = result.items
      .filter((item) => item.link.status === "active")
      .map((item) => ({
        id: item.owner.id,
        owner_name: item.owner.owner_name,
        owner_code: item.owner.owner_code,
        identity_reference: item.owner.identity_or_registration_reference,
        phone: item.owner.phone,
      }))
  } catch (error) {
    ownerLoadError = error instanceof Error ? error.message : "Unable to load linked vehicle owners."
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                VTS provider registration workflow
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                Register a customer vehicle
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                Select an approved active-linked owner, enter the vehicle identity and technical
                information, validate global duplicates, then save a draft or submit for police review.
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/provider/vehicles"><ArrowLeft /> Vehicle registry</Link>
            </Button>
          </div>
        </section>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <CarFront className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Registration permission</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                VTS Admin and VTS Operator accounts can create drafts and submit registrations. Technical
                and Viewer accounts remain read-only.
              </p>
            </div>
          </CardContent>
        </Card>

        {ownerLoadError ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load active-linked owners</AlertTitle>
            <AlertDescription>{ownerLoadError}</AlertDescription>
          </Alert>
        ) : null}

        <GoMaxVehicleImport owners={owners} />
        <ProviderVehicleRegistrationForm owners={owners} />
      </div>
    </div>
  )
}
