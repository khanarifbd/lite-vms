import { ArrowLeft, CarFront } from "lucide-react"
import Link from "next/link"

import { VehicleReviewManager } from "@/components/super-admin/vehicle-review-manager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getAdminVehicle } from "@/features/super-admin/vehicle-review"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ vehicleId: string }> }

export default async function SuperAdminVehicleDetailsPage({ params }: Props) {
  const { vehicleId } = await params
  const detail = await getAdminVehicle(vehicleId)
  const { vehicle } = detail

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">Vehicle verification</Badge>
              <div className="mt-5 flex items-center gap-3"><CarFront className="size-8 text-emerald-200" /><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{vehicle.registration_number_display || vehicle.registration_number}</h1></div>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">Validate global identity, ownership, technical information, compliance documents, GPS setup, QR credential, and verification history.</p>
            </div>
            <Button asChild variant="secondary"><Link href="/super-admin/vehicles"><ArrowLeft /> Vehicle registry</Link></Button>
          </div>
        </section>

        <VehicleReviewManager detail={detail} />
      </div>
    </div>
  )
}
