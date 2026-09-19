import { Skeleton } from "@/components/ui/skeleton"

/**
 * Shared streaming fallback for every provider workspace route. The provider
 * shell remains interactive while the destination page is loading.
 */
export function ProviderPageLoading() {
  return (
    <div
      className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      role="status"
      aria-label="Loading provider page"
    >
      <div className="mx-auto max-w-7xl space-y-5" aria-hidden="true">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 min-w-48 flex-1" />
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-12 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">Loading data, please wait</span>
    </div>
  )
}

export default ProviderPageLoading
