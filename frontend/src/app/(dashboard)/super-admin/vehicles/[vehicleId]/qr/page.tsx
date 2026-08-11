import { ArrowLeft, QrCode } from "lucide-react"
import Link from "next/link"

import { VehicleQrCard } from "@/components/vehicles/vehicle-qr-card"
import { VehicleWorkspaceHero } from "@/components/vehicles/vehicle-workspace-hero"
import { Button } from "@/components/ui/button"
import { getAdminVehicle } from "@/features/super-admin/vehicle-review"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ vehicleId: string }> }

export default async function SuperAdminVehicleQrPage({ params }: Props) {
  const { vehicleId } = await params
  const { vehicle } = await getAdminVehicle(vehicleId)
  const registration = vehicle.registration_number_display || vehicle.registration_number

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <VehicleWorkspaceHero
          eyebrow="Official vehicle credential"
          title="Vehicle QR"
          icon={<QrCode className="size-8" />}
          description={
            <>
              {registration} · View, print, or download the permanent national vehicle verification
              QR card.
            </>
          }
          actions={
            <Button asChild variant="secondary">
              <Link href={`/super-admin/vehicles/${vehicle.id}`}>
                <ArrowLeft /> Vehicle overview
              </Link>
            </Button>
          }
        />

        <VehicleQrCard vehicleId={vehicle.id} />
      </div>
    </div>
  )
}
