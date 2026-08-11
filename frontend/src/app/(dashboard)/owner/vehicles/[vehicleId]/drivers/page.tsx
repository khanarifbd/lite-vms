import { ArrowLeft, ShieldAlert, UsersRound } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { ProviderVehicleDriverManager } from "@/components/provider/provider-vehicle-driver-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getOwnerVehicleDrivers } from "@/lib/owner/vehicle-driver-server"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ vehicleId: string }> }

export default async function OwnerVehicleDriversPage({ params }: Props) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, [USER_ROLES.vehicleOwner])) redirect("/owner/dashboard")

  const { vehicleId } = await params
  try {
    const workspace = await getOwnerVehicleDrivers(vehicleId)
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
            <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
            <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div className="max-w-3xl">
                <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">Owner driver control</Badge>
                <h1 className="mt-5 flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl"><UsersRound className="size-8" /> Vehicle drivers</h1>
                <p className="mt-3 text-emerald-100/75">{workspace.registration_number} · Select from drivers actively linked to your owner profile and assign an eligible driver.</p>
              </div>
              <Button asChild variant="secondary"><Link href={`/owner/vehicles/${vehicleId}`}><ArrowLeft /> Vehicle overview</Link></Button>
            </div>
          </section>

          {!workspace.can_assign ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><ShieldAlert /><AlertTitle>Assignment is locked</AlertTitle><AlertDescription>Bangladesh Police must verify the vehicle before a driver can be assigned.</AlertDescription></Alert> : null}

          <ProviderVehicleDriverManager
            vehicleId={vehicleId}
            initialWorkspace={workspace}
            canManage
            apiBase="/api/owner/vehicles"
            actorLabel="vehicle owner"
          />
        </div>
      </div>
    )
  } catch (error) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-4xl space-y-5">
        <Alert variant="destructive"><ShieldAlert /><AlertTitle>Unable to load vehicle drivers</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Driver workspace is unavailable."}</AlertDescription></Alert>
        <Button asChild variant="outline"><Link href={`/owner/vehicles/${vehicleId}`}><ArrowLeft /> Vehicle overview</Link></Button>
      </div></div>
    )
  }
}
