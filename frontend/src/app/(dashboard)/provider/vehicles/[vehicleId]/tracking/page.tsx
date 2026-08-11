import { ArrowLeft, RadioTower, ShieldAlert, Wifi } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { ProviderVehicleTrackingManager } from "@/components/provider/provider-vehicle-tracking-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ProviderVehicleDetails } from "@/features/provider/vehicle-detail-types"
import type { ProviderVehicleTrackingWorkspace } from "@/features/provider/vehicle-tracking-types"
import { USER_ROLES, userHasAnyRole, userHasRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyProviderApplication } from "@/lib/provider/server"
import { getProviderVehicleTracking } from "@/lib/provider/tracking-server"
import { getProviderVehicleDetails } from "@/lib/provider/vehicle-server"

export const dynamic = "force-dynamic"

const vehicleReadRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsTechnical,
  USER_ROLES.vtsViewer,
] as const
const vehicleManageRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator] as const
const deviceTestRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsTechnical,
] as const

type ProviderVehicleTrackingPageProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function ProviderVehicleTrackingPage({
  params,
}: ProviderVehicleTrackingPageProps) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, vehicleReadRoles)) redirect("/provider/dashboard")

  const application = await getMyProviderApplication()
  if (!application) redirect("/provider/application")
  if (application.status !== "approved") redirect("/provider/vehicles")

  const { vehicleId } = await params
  let vehicle: ProviderVehicleDetails | null = null
  let workspace: ProviderVehicleTrackingWorkspace | null = null
  let loadError: string | null = null
  try {
    ;[vehicle, workspace] = await Promise.all([
      getProviderVehicleDetails(vehicleId),
      getProviderVehicleTracking(vehicleId),
    ])
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load GPS assignment data."
  }

  if (!vehicle || !workspace) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load GPS device assignments</AlertTitle>
            <AlertDescription>{loadError || "GPS assignment data is unavailable."}</AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href={`/provider/vehicles/${vehicleId}`}>
              <ArrowLeft /> Return to vehicle overview
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const registration = vehicle.registration_number_display || vehicle.registration_number
  const canManage = userHasAnyRole(user, vehicleManageRoles)
  const canConfirm = userHasRole(user, USER_ROLES.vtsAdmin)
  const canTest = userHasAnyRole(user, deviceTestRoles)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                Provider GPS device workflow
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                GPS device assignment
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                {registration} · Assign a provider device, confirm installation, verify a real GPS packet,
                activate live tracking, and preserve replacement history.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href={`/provider/vehicles/${vehicle.id}`}>
                  <ArrowLeft /> Vehicle overview
                </Link>
              </Button>
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                <Link href={`/provider/vehicles/${vehicle.id}/documents`}>
                  <RadioTower /> Vehicle documents
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <Alert className="border-blue-200 bg-blue-50 text-blue-950">
          <RadioTower />
          <AlertTitle>Activation requires police verification</AlertTitle>
          <AlertDescription>
            Device assignment, provider confirmation, and testing can be completed before final vehicle
            approval. Live GPS activation remains locked until Bangladesh Police verifies the vehicle.
          </AlertDescription>
        </Alert>

        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <Wifi />
          <AlertTitle>Real device packets now complete the connection test</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              While the assignment is Testing, send telemetry with this device identifier through the national
              endpoint. The received packet records the hardware test automatically.
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href="/provider/integration">Open integration guide</Link>
            </Button>
          </AlertDescription>
        </Alert>

        <ProviderVehicleTrackingManager
          vehicleId={vehicle.id}
          vehicleLabel={registration}
          vehicleVerificationStatus={vehicle.verification_status}
          initialWorkspace={workspace}
          canManage={canManage}
          canConfirm={canConfirm}
          canTest={canTest}
        />
      </div>
    </div>
  )
}
