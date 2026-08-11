import "server-only"

import type { ViolationReviewCandidate } from "@/features/super-admin/violation-review-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export type EnforcementCaseDirection = "next" | "previous"

export type EnforcementCaseReview = {
  id: string
  case_number: string
  candidate_id: string
  organization_id: number
  status: string
  opened_by_user_id: number | null
  opened_at: string
  closed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  candidate: ViolationReviewCandidate | null
}

export type EnforcementCaseCursorPage = {
  items: EnforcementCaseReview[]
  next_cursor: string | null
  previous_cursor: string | null
  has_next: boolean
  has_previous: boolean
  limit: number
}

type GetEnforcementCasesOptions = {
  status?: string
  limit?: number
  cursor?: string
  direction?: EnforcementCaseDirection
}

export async function getPaginatedEnforcementCases({
  status,
  limit = 20,
  cursor,
  direction = "next",
}: GetEnforcementCasesOptions = {}) {
  const search = new URLSearchParams({
    limit: String(limit),
    direction,
  })
  if (status) search.set("status", status)
  if (cursor) search.set("cursor", cursor)

  return authenticatedBackendFetch<EnforcementCaseCursorPage>(
    `/admin/enforcement/national/cases/paginated?${search.toString()}`
  )
}
