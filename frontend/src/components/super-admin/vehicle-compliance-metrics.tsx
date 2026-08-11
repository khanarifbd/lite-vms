import { Clock3, FileText, ShieldAlert } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AdminCommandStats } from "@/features/super-admin/types"

const numberFormatter = new Intl.NumberFormat("en-US")
const expiredHref = "/super-admin/vehicle-documents?status=expired"
const expiringHref = "/super-admin/vehicle-documents?status=expiring_soon"

type DocumentMetric = {
  title: string
  expired: number
  expiring: number
}

function DocumentMetricCard({ title, expired, expiring }: DocumentMetric) {
  return (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
          <FileText className="size-4" aria-hidden="true" />
        </div>
        <Badge variant="outline" className="bg-slate-50 text-[10px] text-slate-600">
          Current approved
        </Badge>
      </div>

      <h3 className="mt-3 min-h-10 text-sm font-semibold leading-5">{title}</h3>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={expiredHref}
          className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 transition hover:border-rose-400 hover:shadow-sm"
        >
          <div className="flex items-center gap-1.5 text-rose-700">
            <ShieldAlert className="size-3.5" aria-hidden="true" />
            <span className="text-[10px] font-medium">Expired</span>
          </div>
          <p className="mt-1 text-xl font-semibold text-rose-950">
            {numberFormatter.format(expired)}
          </p>
          <p className="text-[9px] text-rose-700/80">vehicles</p>
        </Link>

        <Link
          href={expiringHref}
          className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 transition hover:border-amber-400 hover:shadow-sm"
        >
          <div className="flex items-center gap-1.5 text-amber-800">
            <Clock3 className="size-3.5" aria-hidden="true" />
            <span className="text-[10px] font-medium">Next 30 days</span>
          </div>
          <p className="mt-1 text-xl font-semibold text-amber-950">
            {numberFormatter.format(expiring)}
          </p>
          <p className="text-[9px] text-amber-800/80">vehicles</p>
        </Link>
      </div>
    </div>
  )
}

export function VehicleComplianceMetrics({ stats }: { stats: AdminCommandStats }) {
  const metrics: DocumentMetric[] = [
    {
      title: "Registration certificate",
      expired: stats.registration_documents_expired,
      expiring: stats.registration_documents_expiring,
    },
    {
      title: "Fitness certificate",
      expired: stats.fitness_documents_expired,
      expiring: stats.fitness_documents_expiring,
    },
    {
      title: "Tax token",
      expired: stats.tax_tokens_expired,
      expiring: stats.tax_tokens_expiring,
    },
    {
      title: "Insurance",
      expired: stats.insurance_documents_expired,
      expiring: stats.insurance_documents_expiring,
    },
    {
      title: "Route permit",
      expired: stats.route_permits_expired,
      expiring: stats.route_permits_expiring,
    },
  ]

  return (
    <Card id="vehicle-compliance" className="border-slate-200/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <CardTitle className="text-lg">Vehicle document expiry</CardTitle>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Current approved registration, fitness, tax token, insurance, and route permit
              documents across every vehicle on the platform.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:min-w-[360px]">
            <Link
              href={expiredHref}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 transition hover:border-rose-400"
            >
              <p className="text-[10px] text-rose-700">Vehicles with any expired document</p>
              <p className="mt-0.5 text-xl font-semibold text-rose-950">
                {numberFormatter.format(stats.vehicles_with_expired_documents)}
              </p>
            </Link>
            <Link
              href={expiringHref}
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 transition hover:border-amber-400"
            >
              <p className="text-[10px] text-amber-800">Vehicles expiring within 30 days</p>
              <p className="mt-0.5 text-xl font-semibold text-amber-950">
                {numberFormatter.format(stats.vehicles_with_expiring_documents)}
              </p>
            </Link>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {metrics.map((metric) => (
            <DocumentMetricCard key={metric.title} {...metric} />
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
          Each count represents distinct vehicles using the current approved document. Pending
          replacements do not clear compliance alerts until Police approval.
        </p>
      </CardContent>
    </Card>
  )
}
