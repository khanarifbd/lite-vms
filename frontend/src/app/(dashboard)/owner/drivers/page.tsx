import { CarFront, ShieldAlert, UsersRound } from "lucide-react"
import Link from "next/link"

import { DriverConnectionWorkspace } from "@/components/owner/driver-connection-workspace"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  OwnerDriverAssignment,
  OwnerDriverLinkPage,
  OwnerVehiclePage,
} from "@/features/owner/types"
import {
  getMyVehicles,
  getOwnerDriverAssignments,
  getOwnerDriverLinks,
} from "@/lib/owner/server"

export const dynamic = "force-dynamic"

export default async function OwnerDriversPage() {
  let links: OwnerDriverLinkPage | null = null
  let vehicles: OwnerVehiclePage | null = null
  let assignments: OwnerDriverAssignment[] | null = null
  let loadError: string | null = null

  try {
    ;[links, vehicles, assignments] = await Promise.all([
      getOwnerDriverLinks(),
      getMyVehicles({ limit: 100 }),
      getOwnerDriverAssignments(),
    ])
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "The owner-driver service is unavailable."
  }

  if (!links || !vehicles || !assignments) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load driver operations</AlertTitle>
            <AlertDescription>{loadError || "Driver connections are unavailable."}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10 lg:py-10">
          <div className="absolute -right-20 -top-28 size-96 rounded-full border border-white/10" />
          <div className="absolute -bottom-24 right-32 size-72 rounded-full bg-emerald-700/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                <UsersRound /> Consent-based driver operations
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                Driver connections
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                Find registered drivers, approve incoming requests, preserve consent history, and assign verified drivers to owner vehicles.
              </p>
            </div>
            <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
              <Link href="/owner/vehicles"><CarFront /> My vehicles</Link>
            </Button>
          </div>
        </section>

        <DriverConnectionWorkspace
          links={links}
          vehicles={vehicles}
          assignments={assignments}
        />
      </div>
    </div>
  )
}
