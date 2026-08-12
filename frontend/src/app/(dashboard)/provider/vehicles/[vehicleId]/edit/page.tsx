import { ArrowLeft, LockKeyhole, Pencil } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { ProviderVehicleEditForm } from "@/components/provider/provider-vehicle-edit-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ProviderVehicleDetails } from "@/features/provider/vehicle-detail-types"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyProviderApplication } from "@/lib/provider/server"
import { getProviderVehicleDetails } from "@/lib/provider/vehicle-server"

export const dynamic = "force-dynamic"

const vehicleManageRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator] as const
const editableStatuses = new Set(["draft", "changes_requested", "verified"])

type ProviderVehicleEditPageProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function ProviderVehicleEditPage({ params }: ProviderVehicleEditPageProps) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, vehicleManageRoles)) redirect("/provider/vehicles")

  const application = await getMyProviderApplication()
  if (!application) redirect("/provider/application")
  if (application.status !== "approved") redirect("/provider/vehicles")

  const { vehicleId } = await params
  let vehicle: ProviderVehicleDetails | null = null
  let loadError: string | null = null
  try {
    vehicle = await getProviderVehicleDetails(vehicleId)
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load the vehicle registration."
  }

  if (!vehicle) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <Alert variant="destructive">
            <AlertTitle>Unable to load vehicle registration</AlertTitle>
            <AlertDescription>{loadError || "Vehicle data is unavailable."}</AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href="/provider/vehicles">
              <ArrowLeft /> Return to vehicle registry
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!editableStatuses.has(vehicle.verification_status)) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <LockKeyhole />
            <AlertTitle>This vehicle is read-only</AlertTitle>
            <AlertDescription>
              Only draft, verified, or registrations where Bangladesh Police requested changes can be
              edited. Current status: {vehicle.verification_status.replaceAll("_", " ")}.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href={`/provider/vehicles/${vehicle.id}`}>
              <ArrowLeft /> Return to vehicle details
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const registration = vehicle.registration_number_display || vehicle.registration_number

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                Provider vehicle correction workflow
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                Edit {registration}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                Update permitted registration, technical, compliance, and permit information. Vehicle
                ownership remains locked to the active-linked customer.
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link href={`/provider/vehicles/${vehicle.id}`}>
                <ArrowLeft /> Vehicle details
              </Link>
            </Button>
          </div>
        </section>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <Pencil className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Editing permission</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                VTS Admin and VTS Operator accounts can directly edit verified vehicles, drafts, and
                requested corrections. Technical and Viewer accounts keep read-only access.
              </p>
            </div>
          </CardContent>
        </Card>

        <ProviderVehicleEditForm vehicle={vehicle} />
      </div>
    </div>
  )
}
