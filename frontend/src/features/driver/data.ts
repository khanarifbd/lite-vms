import "server-only"

import type { DriverDutyHistoryPage } from "@/features/driver/duty-types"
import type { DriverProfile } from "@/features/driver/types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export async function getDriverProfile(): Promise<DriverProfile> {
  return authenticatedBackendFetch<DriverProfile>("/drivers/me")
}


export async function getDriverDutyHistory(input: {
  fromAt?: string
  toAt?: string
  offset?: number
  limit?: number
} = {}): Promise<DriverDutyHistoryPage> {
  const params = new URLSearchParams({
    offset: String(input.offset ?? 0),
    limit: String(input.limit ?? 20),
  })
  if (input.fromAt) params.set("from_at", input.fromAt)
  if (input.toAt) params.set("to_at", input.toAt)
  return authenticatedBackendFetch<DriverDutyHistoryPage>(
    `/assignments/duty-history?${params.toString()}`
  )
}
