import "server-only"

import type { ViolationReviewCandidate } from "@/features/super-admin/violation-review-types"
import { authenticatedBackendFetch } from "@/lib/api/server"

export type ViolationReviewDirection = "next" | "previous"

export type ViolationReviewCursorPage = {
  items: ViolationReviewCandidate[]
  next_cursor: string | null
  previous_cursor: string | null
  has_next: boolean
  has_previous: boolean
  limit: number
}

type GetViolationReviewQueueOptions = {
  status?: string
  limit?: number
  cursor?: string
  direction?: ViolationReviewDirection
}

export async function getPaginatedViolationReviewQueue({
  status = "pending_review",
  limit = 20,
  cursor,
  direction = "next",
}: GetViolationReviewQueueOptions = {}) {
  const search = new URLSearchParams({
    status,
    limit: String(limit),
    direction,
  })

  if (cursor) search.set("cursor", cursor)

  return authenticatedBackendFetch<ViolationReviewCursorPage>(
    `/admin/enforcement/national/review-queue?${search.toString()}`
  )
}
