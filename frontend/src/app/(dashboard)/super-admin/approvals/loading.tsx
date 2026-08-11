import { Skeleton } from "@/components/ui/skeleton"

function QueueRowSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-52 max-w-[55%]" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-3 w-40" />
            <Skeleton className="mt-3 h-3 w-72 max-w-[85%]" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[190px_100px_auto]">
          <Skeleton className="h-9 rounded-xl" />
          <Skeleton className="h-9 rounded-xl" />
          <div className="col-span-2 flex justify-end gap-2 sm:col-span-1">
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ApprovalQueueLoading() {
  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="rounded-[1.75rem] bg-emerald-950 p-5 sm:p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(560px,0.9fr)] xl:items-end">
            <div>
              <Skeleton className="h-6 w-48 bg-white/15" />
              <Skeleton className="mt-4 h-4 w-44 bg-white/15" />
              <Skeleton className="mt-2 h-8 w-[min(460px,85%)] bg-white/15" />
              <Skeleton className="mt-3 h-4 w-[min(620px,96%)] bg-white/15" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-2xl bg-white/15" />
              ))}
            </div>
          </div>
        </div>

        <Skeleton className="h-12 rounded-2xl" />

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-4 lg:w-[760px]">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="border-b bg-muted/40 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <Skeleton className="h-4 w-56" />
                <Skeleton className="mt-2 h-3 w-36" />
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_150px] xl:w-[700px]">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            </div>
          </div>
          <div className="space-y-2.5 p-3 sm:p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <QueueRowSkeleton key={index} />
            ))}
          </div>
          <div className="flex items-center justify-between border-t bg-muted/40 px-4 py-3">
            <Skeleton className="h-3 w-52" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
