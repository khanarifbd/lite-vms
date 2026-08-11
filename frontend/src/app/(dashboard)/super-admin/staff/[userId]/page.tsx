import { ArrowLeft, History, KeyRound, ShieldCheck } from "lucide-react"
import Link from "next/link"

import { StaffUpdateManager } from "@/components/super-admin/staff-management-manager"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminOrganizations, getAdminStaffDetail } from "@/features/super-admin/staff-management"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ userId: string }> }

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export default async function SuperAdminStaffDetailPage({ params }: Props) {
  const { userId } = await params
  const [detail, organizations] = await Promise.all([
    getAdminStaffDetail(userId),
    getAdminOrganizations(),
  ])
  const { user } = detail

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8"><div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">Platform staff account</Badge><h1 className="mt-5 text-3xl font-semibold sm:text-4xl">{user.display_name}</h1><p className="mt-2 text-emerald-100/70">{user.organization_name || "No organization assigned"} · {user.designation || "No designation"}</p></div><Button asChild variant="secondary"><Link href="/super-admin/staff"><ArrowLeft /> Staff registry</Link></Button></div></section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <Card><CardHeader className="flex flex-row items-start justify-between"><div><CardTitle>Account and login identifiers</CardTitle><p className="mt-1 text-sm text-muted-foreground">Primary and secondary credentials available for login.</p></div><StatusBadge status={user.status} /></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{user.identifiers.map((identifier) => <div key={identifier.public_id} className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-center gap-2"><KeyRound className="size-4 text-emerald-700" /><p className="font-medium">{label(identifier.identifier_type)}</p>{identifier.is_primary ? <Badge>Primary</Badge> : null}</div><p className="mt-2 text-sm">{identifier.masked_value}</p><p className="mt-1 text-xs text-muted-foreground">{identifier.disabled_at ? "Disabled" : identifier.is_verified ? "Verified" : "Not verified"}</p></div>)}</CardContent></Card>

            <Card><CardHeader><CardTitle>Role and organization assignment</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Roles</p><div className="mt-2 flex flex-wrap gap-2">{user.role_codes.map((role) => <Badge key={role} variant="outline">{label(role)}</Badge>)}</div></div><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Organization / district</p><p className="mt-2 font-medium">{user.organization_name || "Not assigned"}</p><p className="text-xs text-muted-foreground">{user.organization_code || ""}</p></div></CardContent></Card>

            <Card><CardHeader><CardTitle>Audit history</CardTitle><p className="text-sm text-muted-foreground">Creation, role, organization, and account-status changes.</p></CardHeader><CardContent className="space-y-3">{detail.audit_history.map((item) => <article key={item.id} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><History className="size-4" /></div><div><p className="font-medium">{label(item.action)}</p><p className="mt-1 text-xs text-muted-foreground">{item.actor_name || "System"} · {formatDate(item.created_at)}</p>{item.reason ? <p className="mt-2 text-sm text-amber-800">{item.reason}</p> : null}</div></div></article>)}{!detail.audit_history.length ? <p className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">No account audit events found.</p> : null}</CardContent></Card>
          </div>

          <div><StaffUpdateManager staff={user} organizations={organizations.filter((item) => item.status === "active")} /></div>
        </section>
      </div>
    </div>
  )
}
