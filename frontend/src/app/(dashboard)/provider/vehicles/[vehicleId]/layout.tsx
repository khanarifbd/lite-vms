import type { ReactNode } from "react"

import { VehicleWorkspaceNav } from "@/components/vehicles/vehicle-workspace-nav"

type ProviderVehicleLayoutProps = {
  children: ReactNode
  params: Promise<{ vehicleId: string }>
}

export default async function ProviderVehicleLayout({
  children,
  params,
}: ProviderVehicleLayoutProps) {
  const { vehicleId } = await params

  return (
    <div>
      <VehicleWorkspaceNav
        baseHref={`/provider/vehicles/${vehicleId}`}
        trackingLabel="GPS assignment"
      />
      {children}
    </div>
  )
}
