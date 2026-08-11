import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react"
import Link from "next/link"

import { ViolationReviewManager } from "@/components/super-admin/violation-review-manager"
import { Button } from "@/components/ui/button"
import {
  getPaginatedViolationReviewQueue,
  type ViolationReviewDirection,
} from "@/features/super-admin/violation-review-pagination"

export const dynamic = "force-dynamic"

const PAGE_SIZES = [10, 20, 50, 100] as const

type ReviewQueueSearchParams = Promise<{
  cursor?: string | string[]
  direction?: string | string[]
  limit?: string | string[]
  page?: string | string[]
}>

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function buildPaginationHref({
  cursor,
  direction,
  limit,
  page,
}: {
  cursor: string
  direction: ViolationReviewDirection
  limit: number
  page: number
}) {
  const search = new URLSearchParams({
    cursor,
    direction,
    limit: String(limit),
    page: String(page),
  })
  return `?${search.toString()}`
}

export default async function ViolationReviewQueuePage({
  searchParams,
}: {
  searchParams: ReviewQueueSearchParams
}) {
  const params = await searchParams
  const requestedLimit = Number(firstValue(params.limit))
  const limit = PAGE_SIZES.includes(requestedLimit as (typeof PAGE_SIZES)[number])
    ? requestedLimit
    : 20
  const cursor = firstValue(params.cursor)
  const direction: ViolationReviewDirection =
    firstValue(params.direction) === "previous" ? "previous" : "next"
  const requestedPage = Number(firstValue(params.page))
  const pageNumber = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  const queuePage = await getPaginatedViolationReviewQueue({
    cursor,
    direction,
    limit,
  })

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-700">
            <ClipboardCheck className="size-5" />
            <span className="text-sm font-semibold">Traffic enforcement</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Violation Review Queue</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Super Admin can review pending violation candidates from every responsible police
            organization. The queue uses cursor pagination so performance remains stable as the
            national dataset grows.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Page <span className="font-semibold text-foreground">{pageNumber}</span>
            <span className="mx-2">·</span>
            Showing <span className="font-semibold text-foreground">{queuePage.items.length}</span>{" "}
            records
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Rows per page</span>
            {PAGE_SIZES.map((size) => (
              <Button
                key={size}
                asChild
                size="sm"
                variant={limit === size ? "default" : "outline"}
              >
                <Link href={`?limit=${size}&page=1`}>{size}</Link>
              </Button>
            ))}
          </div>
        </div>

        <ViolationReviewManager items={queuePage.items} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Cursor pagination loads only the adjacent records; it does not scan or count the full
            violation table.
          </p>
          <div className="flex items-center gap-2">
            {queuePage.has_previous && queuePage.previous_cursor ? (
              <Button asChild variant="outline">
                <Link
                  href={buildPaginationHref({
                    cursor: queuePage.previous_cursor,
                    direction: "previous",
                    limit,
                    page: Math.max(1, pageNumber - 1),
                  })}
                >
                  <ChevronLeft /> Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <ChevronLeft /> Previous
              </Button>
            )}

            {queuePage.has_next && queuePage.next_cursor ? (
              <Button asChild variant="outline">
                <Link
                  href={buildPaginationHref({
                    cursor: queuePage.next_cursor,
                    direction: "next",
                    limit,
                    page: pageNumber + 1,
                  })}
                >
                  Next <ChevronRight />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Next <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
