import type { LucideIcon } from "lucide-react"
import {
  Activity,
  ArrowRight,
  Building2,
  CarFront,
  ClipboardCheck,
  FileClock,
  Gauge,
  History,
  IdCard,
  MapPin,
  RadioTower,
  ShieldAlert,
  UsersRound,
  WifiOff,
} from "lucide-react"
import Link from "next/link"

import { VehicleComplianceMetrics } from "@/components/super-admin/vehicle-compliance-metrics"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminCommandDashboardData } from "@/features/super-admin/data"
import type { AdminCommandAlert } from "@/features/super-admin/types"
import { getAuthenticatedUser } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

const numberFormatter = new Intl.NumberFormat("en-US")
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function percentage(value: number, total: number) {
  if (total <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function humanize(value: string) {
  return value.replaceAll(".", " ").replaceAll("_", " ")
}

function alertHref(alert: AdminCommandAlert) {
  if (alert.key === "driver-review" || alert.key.startsWith("driver-licence")) {
    return "/super-admin/approvals?entity=driver"
  }
  if (alert.key === "vehicle-review") {
    return "/super-admin/approvals?entity=vehicle"
  }
  if (alert.key === "document-review") {
    return "/super-admin/approvals?entity=document&status=pending"
  }
  if (alert.key === "vehicle-documents-expired") {
    return "/super-admin/approvals?entity=document&status=expired"
  }
  if (alert.key === "vehicle-documents-expiring") {
    return "/super-admin/approvals?entity=document&status=expiring_soon"
  }
  if (alert.key === "provider-review") return "/super-admin/approvals?entity=provider"
  if (alert.key === "owner-review") return "/super-admin/approvals?entity=owner"
  return alert.href
}

const toneClasses = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-700",
}

type StatCardProps = {
  title: string
  value: number
  detail: string
  icon: LucideIcon
  href: string
  tone?: keyof typeof toneClasses
}

function StatCard({ title, value, detail, icon: Icon, href, tone = "default" }: StatCardProps) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full border-slate-200/80 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:border-emerald-300 group-hover:shadow-md">
        <CardContent className="flex min-h-28 items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight">{formatNumber(value)}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
          </div>
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
            <Icon className="size-4" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function ProgressRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-semibold text-emerald-800">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

export default async function SuperAdminDashboardPage() {
  const [user, dashboard] = await Promise.all([
    getAuthenticatedUser(),
    getAdminCommandDashboardData(),
  ])
  const { stats } = dashboard

  const totalReviewQueue =
    stats.providers_pending +
    stats.owners_pending +
    stats.vehicles_pending +
    stats.drivers_pending +
    stats.pending_document_reviews
  const gpsHealth = percentage(stats.gps_online, stats.active_tracking)
  const providerApprovalRate = percentage(stats.providers_approved, stats.providers_total)
  const vehicleVerificationRate = percentage(stats.vehicles_verified, stats.vehicles_total)
  const driverVerificationRate = percentage(stats.drivers_verified, stats.drivers_total)
  const driverLicenceRisk = stats.driver_licences_expiring + stats.driver_licences_expired

  const quickActions = [
    { title: "Review VTS providers", description: `${formatNumber(stats.providers_pending)} applications waiting`, href: "/super-admin/approvals?entity=provider", icon: Building2, count: stats.providers_pending },
    { title: "Review vehicle owners", description: `${formatNumber(stats.owners_pending)} applications waiting`, href: "/super-admin/approvals?entity=owner", icon: UsersRound, count: stats.owners_pending },
    { title: "Review vehicles", description: `${formatNumber(stats.vehicles_pending)} registrations waiting`, href: "/super-admin/approvals?entity=vehicle", icon: CarFront, count: stats.vehicles_pending },
    { title: "Review drivers", description: `${formatNumber(stats.drivers_pending)} driver applications waiting`, href: "/super-admin/approvals?entity=driver", icon: IdCard, count: stats.drivers_pending },
    { title: "Review documents", description: `${formatNumber(stats.pending_document_reviews)} vehicle documents waiting`, href: "/super-admin/approvals?entity=document&status=pending", icon: FileClock, count: stats.pending_document_reviews },
  ]

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-emerald-950 px-5 py-5 text-white shadow-lg sm:px-6 lg:px-7">
          <div className="absolute -right-24 -top-28 size-72 rounded-full border border-white/10" />
          <div className="absolute -right-8 top-10 size-64 rounded-full border border-white/10" />
          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-[11px] text-emerald-100 hover:bg-white/10">
                <Activity className="mr-1 size-3.5" /> National command center
              </Badge>
              <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                Good day, {user?.display_name || "Administrator"}.
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-emerald-100/75 sm:text-sm">
                Monitor provider, owner, vehicle, driver, GPS, document, and enforcement readiness from one national workspace.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:min-w-[560px]">
              {[
                ["Review workload", formatNumber(totalReviewQueue)],
                ["Driver verified", `${driverVerificationRate}%`],
                ["GPS health", `${gpsHealth}%`],
                ["Licence risk", formatNumber(driverLicenceRisk)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3 backdrop-blur">
                  <p className="text-[10px] leading-4 text-emerald-100/65">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard title="VTS providers" value={stats.providers_total} detail={`${formatNumber(stats.providers_approved)} approved`} icon={Building2} href="/super-admin/providers" tone="success" />
          <StatCard title="Vehicle owners" value={stats.owners_total} detail={`${formatNumber(stats.owners_pending)} pending`} icon={UsersRound} href="/super-admin/owners" tone="success" />
          <StatCard title="Registered vehicles" value={stats.vehicles_total} detail={`${formatNumber(stats.vehicles_verified)} police verified`} icon={CarFront} href="/super-admin/vehicles" />
          <StatCard title="Registered drivers" value={stats.drivers_total} detail={`${formatNumber(stats.drivers_verified)} police verified`} icon={IdCard} href="/super-admin/approvals?entity=driver" tone="success" />
          <StatCard title="Pending drivers" value={stats.drivers_pending} detail="Identity and licence review" icon={ClipboardCheck} href="/super-admin/approvals?entity=driver" tone={stats.drivers_pending ? "warning" : "success"} />
          <StatCard title="Licences expiring" value={stats.driver_licences_expiring} detail="Within the next 30 days" icon={FileClock} href="/super-admin/approvals?entity=driver" tone={stats.driver_licences_expiring ? "warning" : "success"} />
          <StatCard title="Expired licences" value={stats.driver_licences_expired} detail="Requires operational follow-up" icon={ShieldAlert} href="/super-admin/approvals?entity=driver" tone={stats.driver_licences_expired ? "danger" : "success"} />
          <StatCard title="GPS online" value={stats.gps_online} detail={`${formatNumber(stats.active_tracking)} active assignments`} icon={RadioTower} href="/super-admin/monitoring" tone="success" />
          <StatCard title="GPS offline" value={stats.gps_offline} detail="No recent device signal" icon={WifiOff} href="/super-admin/monitoring" tone={stats.gps_offline ? "danger" : "success"} />
          <StatCard title="Pending documents" value={stats.pending_document_reviews} detail="Vehicle document verification" icon={FileClock} href="/super-admin/approvals?entity=document&status=pending" tone={stats.pending_document_reviews ? "warning" : "success"} />
        </section>

        <VehicleComplianceMetrics stats={stats} />

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div><CardTitle className="text-lg">Review workload</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Open the correct national review queue directly.</p></div>
                <Badge variant="outline" className="bg-amber-50 text-amber-800">{formatNumber(totalReviewQueue)} pending</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2.5 sm:grid-cols-2">
              {quickActions.map(({ title, description, href, icon: Icon, count }) => (
                <Link key={title} href={href} className="group flex items-center gap-3 rounded-2xl border bg-slate-50/70 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/50">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm"><Icon className="size-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{title}</p>{count > 0 ? <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px]">{count}</Badge> : null}</div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3"><div className="flex items-start justify-between gap-4"><div><CardTitle className="text-lg">Operational readiness</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Approval, verification, licence, and tracking health.</p></div><Gauge className="size-5 text-emerald-700" /></div></CardHeader>
            <CardContent>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <ProgressRow label="Provider approval" value={providerApprovalRate} detail={`${formatNumber(stats.providers_approved)} of ${formatNumber(stats.providers_total)} approved`} />
                <ProgressRow label="Vehicle verification" value={vehicleVerificationRate} detail={`${formatNumber(stats.vehicles_verified)} of ${formatNumber(stats.vehicles_total)} verified`} />
                <ProgressRow label="Driver verification" value={driverVerificationRate} detail={`${formatNumber(stats.drivers_verified)} of ${formatNumber(stats.drivers_total)} verified`} />
                <ProgressRow label="GPS availability" value={gpsHealth} detail={`${formatNumber(stats.gps_online)} of ${formatNumber(stats.active_tracking)} online`} />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border bg-slate-50 p-3"><p className="text-[11px] text-muted-foreground">Pending documents</p><p className="mt-1 text-xl font-semibold">{formatNumber(stats.pending_document_reviews)}</p></div>
                <div className="rounded-2xl border bg-amber-50 p-3"><p className="text-[11px] text-amber-800">Changes requested</p><p className="mt-1 text-xl font-semibold text-amber-950">{formatNumber(stats.changes_requested)}</p></div>
                <div className="rounded-2xl border bg-rose-50 p-3"><p className="text-[11px] text-rose-700">Rejected records</p><p className="mt-1 text-xl font-semibold text-rose-950">{formatNumber(stats.rejected_records)}</p></div>
                <div className="rounded-2xl border bg-amber-50 p-3"><p className="text-[11px] text-amber-800">Driver licence risk</p><p className="mt-1 text-xl font-semibold text-amber-950">{formatNumber(driverLicenceRisk)}</p></div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3"><div className="flex items-start justify-between gap-4"><div><CardTitle className="text-lg">Important alerts</CardTitle><p className="mt-1 text-xs text-muted-foreground">Operational and verification items requiring attention.</p></div><MapPin className="size-5 text-emerald-700" /></div></CardHeader>
            <CardContent className="grid gap-2.5 md:grid-cols-2">
              {dashboard.alerts.map((alert) => (
                <Link key={alert.key} href={alertHref(alert)} className="rounded-2xl border p-3.5 transition hover:border-emerald-300 hover:bg-emerald-50/30">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-sm font-medium">{alert.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{alert.description}</p></div>
                    <Badge variant="outline" className={alert.severity === "critical" ? "border-rose-200 bg-rose-50 text-rose-700" : alert.severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "bg-slate-50"}>{formatNumber(alert.count)}</Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3"><div className="flex items-start justify-between gap-4"><div><CardTitle className="text-lg">Recent system activity</CardTitle><p className="mt-1 text-xs text-muted-foreground">Latest audited actions, including driver registration and review.</p></div><History className="size-5 text-emerald-700" /></div></CardHeader>
            <CardContent className="space-y-2.5">
              {dashboard.recent_activity.length ? dashboard.recent_activity.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-2xl border bg-slate-50/60 p-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium capitalize">{humanize(item.action)}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.actor_name || "System"} · {humanize(item.resource_type)}</p></div><span className="shrink-0 text-[10px] text-muted-foreground">{dateFormatter.format(new Date(item.created_at))}</span></div>
                </div>
              )) : <p className="text-sm text-muted-foreground">No recent activity found.</p>}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
