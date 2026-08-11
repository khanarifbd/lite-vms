import { Search, ShieldCheck, UserCog, UsersRound } from "lucide-react"
import Link from "next/link"

import { StaffCreateManager } from "@/components/super-admin/staff-management-manager"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getAdminOrganizations, getAdminStaff } from "@/features/super-admin/staff-management"

export const dynamic = "force-dynamic"

type SearchValue = string | string[] | undefined

type Props = {
  searchParams: Promise<{ search?: SearchValue; status?: SearchValue; role?: SearchValue }>
}

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

export default async function SuperAdminStaffPage({ searchParams }: Props) {
  const query = await searchParams
  const search = first(query.search)?.trim() || ""
  const status = first(query.status)?.trim() || ""
  const role = first(query.role)?.trim() || ""
  const [data, organizations] = await Promise.all([
    getAdminStaff({ search, status, role, limit: 100 }),
    getAdminOrganizations(),
  ])

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-700"><UsersRound className="size-5" /><span className="text-sm font-semibold">Administration</span></div>
          <h1 className="mt-2 text-3xl font-semibold">User Management</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Manage Police Admins, Police Officers, platform administrators, organization scope, login identifiers and account status.</p>
        </div>

        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><CardTitle>Platform staff registry</CardTitle><p className="mt-1 text-sm text-muted-foreground">Search users, review their assigned role and organization, or create a new account.</p></div>
              <StaffCreateManager organizations={organizations.filter((item) => item.status === "active")} />
            </div>
            <form method="get" className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_210px_auto_auto]">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input name="search" defaultValue={search} placeholder="Name, email, mobile, or username" className="pl-9" /></div>
              <select name="role" defaultValue={role} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="">All roles</option><option value="super_admin">Platform Administrator</option><option value="police_admin">Police Admin</option><option value="police_officer">Police Officer</option></select>
              <select name="status" defaultValue={status} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="">All statuses</option>{["active", "suspended", "locked", "disabled"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
              <Button type="submit">Apply filters</Button>
              {search || status || role ? <Button asChild variant="outline"><Link href="/super-admin/staff">Clear</Link></Button> : null}
            </form>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-2">{data.items.map((staff) => <article key={staff.public_id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><UserCog className="size-5" /></div><div><Link href={`/super-admin/staff/${staff.public_id}`} className="font-semibold hover:text-emerald-800">{staff.display_name}</Link><p className="mt-1 text-xs text-muted-foreground">{staff.designation || "Platform staff"} · {staff.member_code || "No service number"}</p></div></div><StatusBadge status={staff.status} /></div><div className="mt-4 flex flex-wrap gap-2">{staff.role_codes.map((item) => <Badge key={item} variant="outline">{label(item)}</Badge>)}{staff.organization_name ? <Badge variant="outline">{staff.organization_name}</Badge> : null}</div><div className="mt-4 grid gap-2 sm:grid-cols-2">{staff.identifiers.map((identifier) => <div key={identifier.public_id} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">{label(identifier.identifier_type)}{identifier.is_primary ? " · Primary" : ""}</p><p className="mt-1 text-sm font-medium">{identifier.masked_value}</p></div>)}</div><Button asChild size="sm" className="mt-4 bg-emerald-800 text-white hover:bg-emerald-900"><Link href={`/super-admin/staff/${staff.public_id}`}><ShieldCheck /> Manage account</Link></Button></article>)}</div>
            {!data.items.length ? <div className="rounded-2xl border border-dashed bg-slate-50 p-10 text-center text-sm text-muted-foreground">No platform staff matched the current filters.</div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
