import type { ReactNode } from "react"

import { VehicleWorkspaceNav } from "@/components/vehicles/vehicle-workspace-nav"

type SuperAdminVehicleLayoutProps = {
  children: ReactNode
  params: Promise<{ vehicleId: string }>
}

export default async function SuperAdminVehicleLayout({
  children,
  params,
}: SuperAdminVehicleLayoutProps) {
  const { vehicleId } = await params

  return (
    <div>
      <VehicleWorkspaceNav baseHref={`/super-admin/vehicles/${vehicleId}`} />
      {children}
    </div>
  )
}
