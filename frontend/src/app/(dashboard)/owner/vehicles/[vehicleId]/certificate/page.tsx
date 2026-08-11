import { ArrowLeft, Award } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { VehicleCertificateManager } from "@/components/vehicle/vehicle-certificate-manager"
import { Button } from "@/components/ui/button"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyVehicleDetails } from "@/lib/owner/server"

export default async function OwnerVehicleCertificatePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, [USER_ROLES.vehicleOwner])) redirect("/owner/vehicles")

  const { vehicleId } = await params
  const vehicle = await getMyVehicleDetails(vehicleId)
  const registration = vehicle.registration_number_display || vehicle.registration_number

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <Button asChild size="sm" variant="outline"><Link href={`/owner/vehicles/${vehicle.id}`}><ArrowLeft /> Vehicle overview</Link></Button>
        <div><p className="text-sm text-muted-foreground">Certificate workspace</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><Award className="text-emerald-800" /> {registration}</h1></div>
        <VehicleCertificateManager
          vehicleId={vehicle.id}
          canManage={false}
          apiBasePath="/api/owner/vehicles"
          documentsHref={`/owner/vehicles/${vehicle.id}/documents`}
        />
      </div>
    </div>
  )
}
