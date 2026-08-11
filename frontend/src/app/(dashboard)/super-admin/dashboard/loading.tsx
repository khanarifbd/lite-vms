import { Skeleton } from "@/components/ui/skeleton"

function MetricSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-32 max-w-full" />
        </div>
        <Skeleton className="size-9 rounded-xl" />
      </div>
    </div>
  )
}

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-64 max-w-full" />
        </div>
        <Skeleton className="size-8 rounded-xl" />
      </div>
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-xl border p-3">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="mt-2 h-3 w-3/4" />
            </div>
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SuperAdminDashboardLoading() {
  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="rounded-[1.75rem] bg-emerald-950 p-5 sm:p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div>
              <Skeleton className="h-6 w-48 bg-white/15" />
              <Skeleton className="mt-4 h-9 w-[min(520px,88%)] bg-white/15" />
              <Skeleton className="mt-3 h-4 w-[min(620px,96%)] bg-white/15" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:min-w-[560px]">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-2xl bg-white/15" />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <MetricSkeleton key={index} />
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <PanelSkeleton rows={5} />
          <PanelSkeleton rows={4} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <PanelSkeleton rows={4} />
          <PanelSkeleton rows={6} />
        </div>
      </div>
    </div>
  )
}
