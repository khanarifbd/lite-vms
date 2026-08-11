import { ArrowLeft, ShieldAlert, UsersRound } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { ProviderVehicleDriverManager } from "@/components/provider/provider-vehicle-driver-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyProviderApplication } from "@/lib/provider/server"
import { getProviderVehicleDrivers } from "@/lib/provider/vehicle-driver-server"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ vehicleId: string }> }

const readRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsTechnical,
  USER_ROLES.vtsViewer,
] as const
const manageRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator] as const

export default async function ProviderVehicleDriversPage({ params }: Props) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, readRoles)) redirect("/provider/dashboard")

  const application = await getMyProviderApplication()
  if (!application) redirect("/provider/application")
  if (application.status !== "approved") redirect("/provider/vehicles")

  const { vehicleId } = await params
  try {
    const workspace = await getProviderVehicleDrivers(vehicleId)
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
            <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
            <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div className="max-w-3xl">
                <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">Provider driver control</Badge>
                <h1 className="mt-5 flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl"><UsersRound className="size-8" /> Vehicle drivers</h1>
                <p className="mt-3 text-emerald-100/75">{workspace.registration_number} · View owner-linked driver profiles, licence readiness, active assignments, and assign an eligible driver.</p>
              </div>
              <Button asChild variant="secondary"><Link href={`/provider/vehicles/${vehicleId}`}><ArrowLeft /> Vehicle overview</Link></Button>
            </div>
          </section>
          {!workspace.can_assign ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><ShieldAlert /><AlertTitle>Assignment is locked</AlertTitle><AlertDescription>Bangladesh Police must verify the vehicle before a driver can be assigned.</AlertDescription></Alert> : null}
          <ProviderVehicleDriverManager vehicleId={vehicleId} initialWorkspace={workspace} canManage={userHasAnyRole(user, manageRoles)} />
        </div>
      </div>
    )
  } catch (error) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-4xl space-y-5">
        <Alert variant="destructive"><ShieldAlert /><AlertTitle>Unable to load vehicle drivers</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Driver workspace is unavailable."}</AlertDescription></Alert>
        <Button asChild variant="outline"><Link href={`/provider/vehicles/${vehicleId}`}><ArrowLeft /> Vehicle overview</Link></Button>
      </div></div>
    )
  }
}
