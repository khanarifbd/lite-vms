import { Skeleton } from "@/components/ui/skeleton"

export default function EnforcementDashboardLoading() {
  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-emerald-950 px-6 py-7 sm:px-8 lg:px-10">
          <div className="absolute -right-20 -top-28 size-80 rounded-full border border-white/10" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="space-y-4">
              <Skeleton className="h-7 w-52 bg-white/15" />
              <Skeleton className="h-10 w-full max-w-xl bg-white/15" />
              <Skeleton className="h-5 w-full max-w-2xl bg-white/10" />
              <Skeleton className="h-5 w-4/5 max-w-xl bg-white/10" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-40 rounded-full bg-white/10" />
                <Skeleton className="h-7 w-36 rounded-full bg-white/10" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-40 bg-white/15" />
              <Skeleton className="h-10 w-40 bg-white/20" />
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-9 w-20" />
                </div>
                <Skeleton className="size-10 rounded-xl" />
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="size-4" />
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-7 w-72" />
            <Skeleton className="mt-2 h-4 w-96 max-w-full" />
            <div className="mt-7 grid gap-5 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index}>
                  <div className="flex justify-between gap-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <Skeleton className="mt-3 h-2 w-full rounded-full" />
                  <Skeleton className="mt-3 h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-3 h-7 w-44" />
            <Skeleton className="mt-6 h-11 w-20" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <Skeleton className="mt-6 h-10 w-full" />
          </div>
        </section>

        <section>
          <Skeleton className="h-7 w-52" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex justify-between gap-4">
                  <Skeleton className="size-11 rounded-xl" />
                  <Skeleton className="h-8 w-10" />
                </div>
                <Skeleton className="mt-5 h-5 w-36" />
                <Skeleton className="mt-3 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-5/6" />
                <div className="mt-5 flex justify-between border-t pt-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
