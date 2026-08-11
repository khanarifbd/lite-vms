import { Skeleton } from "@/components/ui/skeleton"

export default function DriverDashboardLoading() {
  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="rounded-[1.75rem] bg-emerald-950 p-5 sm:p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(500px,0.85fr)] xl:items-end">
            <div><Skeleton className="h-6 w-52 bg-white/15" /><Skeleton className="mt-4 h-4 w-36 bg-white/15" /><Skeleton className="mt-2 h-8 w-[min(480px,90%)] bg-white/15" /><Skeleton className="mt-3 h-4 w-[min(650px,96%)] bg-white/15" /></div>
            <div className="grid grid-cols-2 gap-2.5">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-2xl bg-white/15" />)}</div>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}</div>
        <div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  )
}
