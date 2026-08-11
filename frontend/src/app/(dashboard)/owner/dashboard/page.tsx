import {
  AlertTriangle,
  ArrowRight,
  CarFront,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileClock,
  FileText,
  Network,
  Plus,
  RadioTower,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { OwnerDashboardData } from "@/features/owner/types"
import { getOwnerDashboardData } from "@/lib/owner/server"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const verificationCopy = {
  pending: ["Pending verification", "Your owner information is waiting for national registry review.", "border-amber-200 bg-amber-50 text-amber-900"],
  under_review: ["Under review", "Bangladesh Police is currently reviewing your submitted information.", "border-blue-200 bg-blue-50 text-blue-900"],
  approved: ["Owner approved", "Your identity is approved for vehicle and provider services.", "border-emerald-200 bg-emerald-50 text-emerald-900"],
  changes_requested: ["Changes requested", "Update and resubmit the requested owner information.", "border-amber-200 bg-amber-50 text-amber-900"],
  rejected: ["Application rejected", "Review the official feedback before resubmitting.", "border-red-200 bg-red-50 text-red-900"],
  suspended: ["Owner suspended", "Vehicle-owner services are currently suspended.", "border-red-200 bg-red-50 text-red-900"],
} as const

const actionStyle = {
  critical: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-blue-200 bg-blue-50",
} as const

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })
const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" })

function label(value: string) {
  return value.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
}

function formatDateTime(value: string | null) {
  if (!value) return "No tracking data"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "No tracking data" : dateTimeFormatter.format(parsed)
}

export default async function OwnerDashboardPage() {
  let dashboard: OwnerDashboardData | null = null
  let loadError: string | null = null

  try {
    dashboard = await getOwnerDashboardData()
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The vehicle-owner service is unavailable."
  }

  if (!dashboard) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive"><ShieldAlert /><AlertTitle>Unable to load the owner dashboard</AlertTitle><AlertDescription>{loadError || "Owner data is unavailable."}</AlertDescription></Alert>
        </div>
      </div>
    )
  }

  const { owner, stats, actions, document_alerts: documentAlerts, recent_vehicles: recentVehicles } = dashboard
  const verification = verificationCopy[owner.verification_status]
  const fleetHealth = stats.vehicles > 0 ? Math.round((stats.online_vehicles / stats.vehicles) * 100) : 0

  const quickLinks = [
    { title: "Add vehicle", description: "Register a vehicle under your verified owner profile.", href: "/owner/vehicles/register", icon: Plus },
    { title: "My vehicles", description: "Open vehicle details, GPS status, and documents.", href: "/owner/vehicles", icon: CarFront },
    { title: "VTS providers", description: "Approve provider requests and control vehicle access.", href: "/owner/providers", icon: Network },
    { title: "Drivers", description: "Manage driver records and assignments.", href: "/owner/drivers", icon: UsersRound },
    { title: "Owner profile", description: "Review identity, documents, and police verification.", href: "/owner/profile", icon: UserRoundCheck },
    { title: "Settings", description: "Manage account preferences and security.", href: "/owner/settings", icon: Settings },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10 lg:py-10">
          <div className="absolute -right-20 -top-28 size-96 rounded-full border border-white/10" />
          <div className="absolute -right-2 -top-10 size-96 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">Vehicle owner command center</Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome, {owner.owner_name}</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                See vehicle approval, GPS connection, provider access, and document warnings from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary"><Link href="/owner/vehicles"><CarFront /> My vehicles</Link></Button>
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50"><Link href="/owner/vehicles/register"><Plus /> Add vehicle</Link></Button>
            </div>
          </div>
        </section>

        <Alert className={verification[2]}>
          {owner.verification_status === "approved" ? <CheckCircle2 /> : <Clock3 />}
          <AlertTitle>{verification[0]}</AlertTitle>
          <AlertDescription>{verification[1]}</AlertDescription>
        </Alert>

        {owner.review_notes ? (
          <Alert variant={owner.verification_status === "rejected" ? "destructive" : "default"}>
            <FileCheck2 /><AlertTitle>Official review notes</AlertTitle><AlertDescription>{owner.review_notes}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Registered vehicles", value: stats.vehicles, detail: `${stats.verified_vehicles} verified · ${stats.pending_vehicles} pending`, icon: CarFront },
            { title: "Fleet GPS health", value: `${fleetHealth}%`, detail: `${stats.online_vehicles} online · ${stats.offline_vehicles} offline`, icon: RadioTower },
            { title: "Active tracking", value: stats.active_tracking_vehicles, detail: `${Math.max(stats.vehicles - stats.active_tracking_vehicles, 0)} without active GPS`, icon: RadioTower },
            { title: "Provider connections", value: stats.active_providers, detail: `${stats.pending_provider_requests} awaiting decision`, icon: Network },
          ].map(({ title, value, detail, icon: Icon }) => (
            <Card key={title}>
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div><p className="text-sm text-muted-foreground">{title}</p><p className="mt-3 text-3xl font-semibold capitalize">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
                <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><Icon className="size-5" /></div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-amber-700" /> Action center</CardTitle><Badge variant="outline">{actions.length} types</Badge></div></CardHeader>
            <CardContent>
              {actions.length ? (
                <div className="space-y-3">
                  {actions.map((action) => (
                    <Link key={action.key} href={action.href} className={cn("group flex flex-col justify-between gap-4 rounded-2xl border p-4 transition hover:shadow-md sm:flex-row sm:items-center", actionStyle[action.severity])}>
                      <div><p className="font-semibold">{action.title}</p><p className="mt-1 text-sm text-muted-foreground">{action.description}</p></div>
                      <div className="flex items-center gap-2"><Badge variant="outline">{action.count}</Badge><ArrowRight className="size-4 transition group-hover:translate-x-1" /></div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-emerald-50 px-6 text-center"><CheckCircle2 className="size-10 text-emerald-700" /><h3 className="mt-4 font-semibold text-emerald-950">You are all caught up</h3><p className="mt-1 max-w-md text-sm text-emerald-900/70">No provider requests, corrections, document warnings, or GPS actions require attention.</p></div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileClock className="size-5 text-amber-700" /> Document expiry watch</CardTitle></CardHeader>
            <CardContent>
              {documentAlerts.length ? (
                <div className="space-y-3">
                  {documentAlerts.map((document) => (
                    <Link key={`${document.vehicle_id}-${document.document_type}`} href={`/owner/vehicles/${document.vehicle_id}/documents`} className="flex items-center justify-between gap-4 rounded-2xl border bg-slate-50 p-4 transition hover:bg-slate-100">
                      <div className="min-w-0"><p className="truncate font-semibold">{document.registration_number}</p><p className="mt-1 text-xs text-muted-foreground">{label(document.document_type)} · {formatDate(document.expiry_date)}</p></div>
                      <Badge variant={document.status === "expired" ? "destructive" : "secondary"}>{document.status === "expired" ? `${Math.abs(document.days_remaining)}d expired` : document.days_remaining === 0 ? "Today" : `${document.days_remaining}d left`}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 px-6 text-center"><FileCheck2 className="size-9 text-emerald-700" /><h3 className="mt-4 font-semibold">No document expiry warnings</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Compliance dates are clear for the next 30 days.</p></div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><CarFront className="size-5 text-emerald-700" /> Recent vehicles</CardTitle><Button asChild size="sm" variant="outline"><Link href="/owner/vehicles">View all</Link></Button></div></CardHeader>
            <CardContent>
              {recentVehicles.length ? (
                <div className="space-y-3">
                  {recentVehicles.map((vehicle) => (
                    <article key={vehicle.id} className="rounded-2xl border bg-slate-50 p-4">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div>
                          <p className="font-semibold">{vehicle.registration_number_display || vehicle.registration_number}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{[vehicle.brand, vehicle.model, vehicle.vehicle_type].filter(Boolean).join(" · ")}</p>
                          <p className="mt-2 text-xs text-muted-foreground">Last GPS: {formatDateTime(vehicle.tracking_last_seen_at)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={vehicle.gps_online ? "default" : "secondary"} className={vehicle.gps_online ? "bg-emerald-700" : ""}>{vehicle.active_tracking ? vehicle.gps_online ? "GPS online" : "GPS offline" : "Tracking not assigned"}</Badge>
                          {vehicle.document_attention_count > 0 ? <Badge variant="destructive">{vehicle.document_attention_count} document alerts</Badge> : null}
                          <Badge variant="outline">{label(vehicle.verification_status)}</Badge>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                        <Button asChild size="sm"><Link href={`/owner/vehicles/${vehicle.id}`}>Vehicle details</Link></Button>
                        <Button asChild size="sm" variant="outline"><Link href={`/owner/vehicles/${vehicle.id}/tracking`}><RadioTower /> GPS status</Link></Button>
                        <Button asChild size="sm" variant="outline"><Link href={`/owner/vehicles/${vehicle.id}/documents`}><FileText /> Documents</Link></Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 px-6 text-center"><CarFront className="size-9 text-emerald-700" /><h3 className="mt-4 font-semibold">No vehicles registered</h3><p className="mt-1 text-sm text-muted-foreground">Add your first vehicle to begin.</p><Button asChild className="mt-4 bg-emerald-800 text-white hover:bg-emerald-900"><Link href="/owner/vehicles/register"><Plus /> Add vehicle</Link></Button></div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-700" /> Quick access</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {quickLinks.map(({ title, description, href, icon: Icon }) => (
                <Button key={title} asChild variant="outline" className="h-auto justify-between gap-4 rounded-2xl px-4 py-4 text-left">
                  <Link href={href}><span className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><Icon className="size-5" /></span><span><span className="block font-semibold">{title}</span><span className="mt-1 block whitespace-normal text-xs font-normal leading-5 text-muted-foreground">{description}</span></span></span><ArrowRight className="size-4 shrink-0" /></Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
