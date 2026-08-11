import {
  Activity,
  ArrowRight,
  Ban,
  Building2,
  CircleAlert,
  FileClock,
  Gauge,
  MapPinned,
  Plus,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getEnforcementDashboardSummary } from "@/features/super-admin/enforcement"

export const dynamic = "force-dynamic"

const numberFormatter = new Intl.NumberFormat("en-BD")
const timeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

export default async function SuperAdminEnforcementPage() {
  const data = await getEnforcementDashboardSummary()
  const ruleCoverage = data.rules_total
    ? Math.round((data.rules_active / data.rules_total) * 100)
    : 0
  const policyCoverage = data.policies_total
    ? Math.round((data.policies_active / data.policies_total) * 100)
    : 0
  const generatedAt = new Date(data.generated_at)

  const metrics = [
    {
      label: "Active rules",
      value: data.rules_active,
      detail: `${data.rules_inactive} inactive · ${ruleCoverage}% enabled`,
      icon: Gauge,
      href: "/super-admin/enforcement/speed-rules",
    },
    {
      label: "Map control zones",
      value: data.map_based_rules,
      detail: `${data.geofences_active} of ${data.geofences_total} geofences active`,
      icon: MapPinned,
      href: "/super-admin/enforcement/speed-zones",
    },
    {
      label: "Pending review",
      value: data.candidates_pending_review,
      detail: "Violation candidates awaiting action",
      icon: CircleAlert,
      href: "/super-admin/enforcement/review-queue",
    },
    {
      label: "Open cases",
      value: data.cases_open,
      detail: "National enforcement cases in progress",
      icon: Siren,
      href: "/super-admin/enforcement/cases",
    },
  ]

  const modules = [
    {
      title: "Speed rules",
      description: "Create legal limits, tolerance, vehicle scope, schedules, and activation rules.",
      count: data.rules_total,
      meta: `${data.rules_active} active`,
      href: "/super-admin/enforcement/speed-rules",
      icon: Gauge,
    },
    {
      title: "Speed zones",
      description: "Draw and manage school, highway, city, corridor, circle, and polygon control areas.",
      count: data.map_based_rules,
      meta: `${data.geofences_active} geofences active`,
      href: "/super-admin/enforcement/speed-zones",
      icon: MapPinned,
    },
    {
      title: "Violation policies",
      description: "Control duration, packet confirmation, cooldown, legal reference, and review priority.",
      count: data.policies_total,
      meta: `${policyCoverage}% enabled`,
      href: "/super-admin/enforcement/policies",
      icon: Scale,
    },
    {
      title: "Jurisdictions",
      description: "Map responsible Bangladesh Police units to enforcement review and case ownership.",
      count: data.jurisdictions_total,
      meta: `${data.jurisdictions_active} active`,
      href: "/super-admin/enforcement/jurisdictions",
      icon: Building2,
    },
    {
      title: "Vehicle exceptions",
      description: "Manage temporary exemptions for emergency, law-enforcement, and permitted vehicles.",
      count: data.exemptions_active,
      meta: `${data.exemptions_expiring_soon} expire within 7 days`,
      href: "/super-admin/enforcement/exceptions",
      icon: Ban,
    },
    {
      title: "Change history",
      description: "Review the operator, timestamp, previous value, new value, and reason for every change.",
      count: data.configuration_changes_24h,
      meta: "changes in the last 24 hours",
      href: "/super-admin/audit-logs",
      icon: FileClock,
    },
  ]

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-emerald-950 px-6 py-7 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-20 -top-28 size-80 rounded-full border border-white/10" />
          <div className="absolute -bottom-28 right-40 size-72 rounded-full bg-emerald-700/20 blur-3xl" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                <ShieldAlert className="mr-1 size-3.5" /> National traffic enforcement
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Enforcement command workspace
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-100/75 sm:text-base sm:leading-7">
                Monitor policy readiness, speed-control coverage, pending violation review, open cases,
                exemptions, and configuration changes from one operational dashboard.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-emerald-100/70">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <Activity className="size-3.5" /> Live database summary
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <ShieldCheck className="size-3.5" /> {data.national_rules} national rule{data.national_rules === 1 ? "" : "s"}
                </span>
                <span>Updated {Number.isNaN(generatedAt.getTime()) ? "just now" : timeFormatter.format(generatedAt)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/super-admin/enforcement/review-queue">
                  <CircleAlert /> Review violations
                </Link>
              </Button>
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                <Link href="/super-admin/enforcement/speed-rules">
                  <Plus /> Create speed rule
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, detail, icon: Icon, href }) => (
            <Link key={label} href={href} className="group">
              <Card className="h-full transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight">
                        {numberFormatter.format(value)}
                      </p>
                    </div>
                    <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Icon className="size-5" />
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
                    <ArrowRight className="size-4 shrink-0 text-emerald-700 transition group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Configuration health
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">National enforcement readiness</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Active configuration compared with all records currently stored.
                  </p>
                </div>
                <Badge variant="outline">Server-calculated</Badge>
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-3">
                {[
                  ["Speed rules", data.rules_active, data.rules_total],
                  ["Policies", data.policies_active, data.policies_total],
                  ["Jurisdictions", data.jurisdictions_active, data.jurisdictions_total],
                ].map(([label, active, total]) => {
                  const activeValue = Number(active)
                  const totalValue = Number(total)
                  const percentage = totalValue ? Math.round((activeValue / totalValue) * 100) : 0
                  return (
                    <div key={String(label)}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground">{activeValue}/{totalValue}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-700" style={{ width: `${percentage}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{percentage}% enabled</p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className={data.exemptions_expiring_soon ? "border-amber-200 bg-amber-50/50" : ""}>
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Attention required
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">Exception expiry</h2>
                </div>
                <Ban className="size-5 text-amber-700" />
              </div>
              <p className="mt-5 text-4xl font-semibold tracking-tight">
                {numberFormatter.format(data.exemptions_expiring_soon)}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                active vehicle exemption{data.exemptions_expiring_soon === 1 ? "" : "s"} expire within the next seven days.
              </p>
              <Button asChild variant="outline" className="mt-5 w-full">
                <Link href="/super-admin/enforcement/exceptions">Review exceptions <ArrowRight /></Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section>
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold">Enforcement modules</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open a focused workspace while keeping this dashboard lightweight and summary-only.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">No full configuration lists are loaded on this page.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modules.map(({ title, description, count, meta, href, icon: Icon }) => (
              <Link
                key={title}
                href={href}
                className="group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-2xl font-semibold">{numberFormatter.format(count)}</span>
                </div>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
                  <span className="text-xs text-muted-foreground">{meta}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                    Open <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
