import "server-only"

import type { ProviderStaffPage } from "@/features/provider/staff-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getProviderStaff() {
  return authenticatedBackendFetch<ProviderStaffPage>("/providers/staff?limit=200")
}
