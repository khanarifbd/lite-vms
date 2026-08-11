import { VehicleQrCard } from "@/components/vehicles/vehicle-qr-card"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ vehicleId: string }> }

export default async function ProviderVehicleQrPage({ params }: Props) {
  const { vehicleId } = await params
  return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><VehicleQrCard vehicleId={vehicleId} /></div>
}
