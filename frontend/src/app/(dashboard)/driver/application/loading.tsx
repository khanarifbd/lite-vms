import { Skeleton } from "@/components/ui/skeleton"

export default function DriverApplicationLoading() {
  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="rounded-[1.75rem] bg-emerald-950 p-5 sm:p-6">
          <Skeleton className="h-6 w-56 bg-white/15" />
          <Skeleton className="mt-4 h-4 w-40 bg-white/15" />
          <Skeleton className="mt-2 h-8 w-[min(560px,90%)] bg-white/15" />
          <Skeleton className="mt-3 h-4 w-[min(700px,96%)] bg-white/15" />
        </div>
        {Array.from({ length: 5 }).map((_, section) => (
          <div key={section} className="rounded-2xl border bg-white p-5">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="mt-2 h-3 w-96 max-w-full" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: section === 3 ? 3 : 6 }).map((__, index) => (
                <Skeleton key={index} className={section === 3 ? "h-36 rounded-2xl" : "h-16 rounded-xl"} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
