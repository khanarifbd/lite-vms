import type {
  OwnerVehicle,
  OwnerVehiclePage,
  OwnerVehicleRegistryOwner,
  OwnerVehicleRegistryStats,
} from "@/features/owner/types"

export type ProviderVehicleRegistryOwner = OwnerVehicleRegistryOwner
export type ProviderVehicle = OwnerVehicle
export type ProviderVehicleRegistryStats = OwnerVehicleRegistryStats
export type ProviderVehiclePage = OwnerVehiclePage

export type ProviderVehicleRegistryQuery = {
  page?: number
  limit?: number
  search?: string
  status?: string
  gps?: "online" | "offline" | ""
  tracking?: string
  cursor?: string
}
