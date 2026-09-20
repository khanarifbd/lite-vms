import { Skeleton } from "@/components/ui/skeleton"

/** Shared streaming fallback for every owner route, including deep vehicle pages. */
export function OwnerPageLoading() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8" role="status" aria-label="Loading owner page">
      <div className="mx-auto max-w-7xl space-y-5" aria-hidden="true">
        <div className="space-y-3 rounded-3xl bg-emerald-950 px-6 py-8">
          <Skeleton className="h-5 w-40 bg-white/20" />
          <Skeleton className="h-9 w-72 max-w-full bg-white/20" />
          <Skeleton className="h-4 w-96 max-w-full bg-white/20" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-10 min-w-44 flex-1" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-28" />
          </div>
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-12 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">Loading owner data, please wait</span>
    </div>
  )
}

export default OwnerPageLoading
