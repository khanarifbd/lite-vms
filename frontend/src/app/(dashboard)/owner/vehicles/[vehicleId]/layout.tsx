import type { ReactNode } from "react"

import { VehicleWorkspaceNav } from "@/components/vehicles/vehicle-workspace-nav"

type OwnerVehicleLayoutProps = {
  children: ReactNode
  params: Promise<{ vehicleId: string }>
}

export default async function OwnerVehicleLayout({
  children,
  params,
}: OwnerVehicleLayoutProps) {
  const { vehicleId } = await params

  return (
    <div>
      <VehicleWorkspaceNav baseHref={`/owner/vehicles/${vehicleId}`} />
      {children}
    </div>
  )
}
