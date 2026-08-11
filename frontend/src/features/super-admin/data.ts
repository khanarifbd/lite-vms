import "server-only"

import type {
  AdminCommandDashboardData,
  BackendSuperAdminDashboard,
  SuperAdminDashboardData,
} from "@/features/super-admin/types"
import { authenticatedBackendFetch } from "@/lib/api/server"

const emptyDashboard: SuperAdminDashboardData = {
  totals: {
    users: 0,
    activeUsers: 0,
    providers: 0,
    approvedProviders: 0,
    owners: 0,
    vehicles: 0,
  },
  pending: {
    providers: 0,
    owners: 0,
    vehicles: 0,
  },
  recentUsers: [],
  recentProviders: [],
  warnings: [],
}

export async function getSuperAdminDashboardData(): Promise<SuperAdminDashboardData> {
  try {
    const data = await authenticatedBackendFetch<BackendSuperAdminDashboard>(
      "/dashboard/super-admin"
    )

    return {
      totals: {
        users: data.totals.users,
        activeUsers: data.totals.active_users,
        providers: data.totals.providers,
        approvedProviders: data.totals.approved_providers,
        owners: data.totals.owners,
        vehicles: data.totals.vehicles,
      },
      pending: data.pending,
      recentUsers: data.recent_users,
      recentProviders: data.recent_providers,
      warnings: [],
    }
  } catch (error) {
    return {
      ...emptyDashboard,
      warnings: [
        error instanceof Error
          ? error.message
          : "Unable to load the aggregated dashboard summary.",
      ],
    }
  }
}

export async function getAdminCommandDashboardData() {
  return authenticatedBackendFetch<AdminCommandDashboardData>("/dashboard/admin-command")
}
