import { NextResponse } from "next/server"

import type { ProviderOwnerPortfolioPage } from "@/features/provider/owner-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

const linkStatuses = new Set([
  "pending_owner_approval",
  "pending_provider_approval",
  "active",
  "rejected",
  "suspended",
  "ended",
])

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const rawOffset = params.get("offset") ?? "0"
  const rawLimit = params.get("limit") ?? "25"
  const offset = Number(rawOffset)
  const limit = Number(rawLimit)
  const search = (params.get("search") ?? "").trim()
  const status = params.get("status") ?? ""

  if (
    !/^\d+$/.test(rawOffset) ||
    !/^\d+$/.test(rawLimit) ||
    !Number.isSafeInteger(offset) || offset < 0 ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
    search.length > 180 ||
    (status !== "" && !linkStatuses.has(status))
  ) {
    return NextResponse.json({ message: "Invalid owner portfolio pagination or filters." }, { status: 400 })
  }

  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  if (search) query.set("search", search)
  if (status) query.set("status", status)

  try {
    const page = await authenticatedBackendFetch<ProviderOwnerPortfolioPage>(
      `/providers/me/owners/portfolio?${query.toString()}`
    )
    return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to load vehicle owners." }, { status: 500 })
  }
}
