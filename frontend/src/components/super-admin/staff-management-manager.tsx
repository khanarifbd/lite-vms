"use client"

import { CheckCircle2, Loader2, ShieldAlert, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { OrganizationTreeSelect } from "@/components/super-admin/organization-tree-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AdminOrganization, AdminStaff } from "@/features/super-admin/staff-management"

const roles = [
  ["police_admin", "Police Admin"],
  ["police_officer", "Police Officer"],
  ["super_admin", "Platform Administrator"],
] as const

async function message(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
  return data?.message || data?.detail || fallback
}

function nationalPlatformOrganizations(organizations: AdminOrganization[]) {
  const root = organizations.find((item) => item.organization_type === "bangladesh_police")
    ?? organizations.find((item) => item.code === "PLATFORM-HQ")
  if (!root) return organizations
  return organizations.filter((item) => item.tenant_public_id === root.tenant_public_id)
}

export function StaffCreateManager({ organizations }: { organizations: AdminOrganization[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scopedOrganizations = useMemo(() => nationalPlatformOrganizations(organizations), [organizations])

  function close() {
    if (pending) return
    setOpen(false)
    setError(null)
  }

  async function submit(formData: FormData) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/super-admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: formData.get("display_name"),
          email: formData.get("email"),
          mobile: formData.get("mobile") || null,
          username: formData.get("username") || null,
          temporary_password: formData.get("temporary_password"),
          organization_public_id: formData.get("organization_public_id"),
          role_codes: [formData.get("role")],
          designation: formData.get("designation") || null,
          member_code: formData.get("member_code") || null,
        }),
      })
      if (!response.ok) throw new Error(await message(response, "Unable to create staff account."))
      setOpen(false)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create staff account.")
    } finally {
      setPending(false)
    }
  }

  return <>
    <Button onClick={() => { setError(null); setOpen(true) }} className="shrink-0 bg-emerald-800 hover:bg-emerald-900"><UserPlus /> Add user</Button>
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add platform user</DialogTitle>
          <DialogDescription>Create a Police Admin, Police Officer, or platform administrator and assign an organization scope.</DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><ShieldAlert /><AlertTitle>Creation failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <form action={submit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="display_name">Full name</Label><Input id="display_name" name="display_name" required /></div>
          <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
          <div className="space-y-2"><Label htmlFor="mobile">Mobile</Label><Input id="mobile" name="mobile" /></div>
          <div className="space-y-2"><Label htmlFor="username">Username</Label><Input id="username" name="username" /></div>
          <div className="space-y-2"><Label htmlFor="temporary_password">Temporary password</Label><Input id="temporary_password" name="temporary_password" type="password" minLength={10} required /></div>
          <div className="space-y-2"><Label htmlFor="role">Role</Label><select id="role" name="role" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" required>{roles.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>
          <div className="space-y-2 md:col-span-2"><Label>Organization / district</Label><OrganizationTreeSelect name="organization_public_id" items={scopedOrganizations} rootLabel="Select organization / district" help="Search and select Bangladesh Police, Range/Division, District, Upazila/Thana or another National Platform organization." /></div>
          <div className="space-y-2"><Label htmlFor="designation">Designation</Label><Input id="designation" name="designation" /></div>
          <div className="space-y-2"><Label htmlFor="member_code">Service / staff number</Label><Input id="member_code" name="member_code" /></div>
          <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Create user</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>
}

export function StaffUpdateManager({ staff, organizations }: { staff: AdminStaff; organizations: AdminOrganization[] }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scopedOrganizations = useMemo(() => nationalPlatformOrganizations(organizations), [organizations])

  async function submit(formData: FormData) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/super-admin/staff/${staff.public_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: formData.get("display_name"),
          status: formData.get("status"),
          organization_public_id: formData.get("organization_public_id"),
          role_codes: [formData.get("role")],
          designation: formData.get("designation"),
          member_code: formData.get("member_code"),
          reason: formData.get("reason"),
        }),
      })
      if (!response.ok) throw new Error(await message(response, "Unable to update staff account."))
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update staff account.")
    } finally {
      setPending(false)
    }
  }

  return <Card><CardHeader><CardTitle>Role, scope, and account status</CardTitle></CardHeader><CardContent>{error ? <Alert variant="destructive" className="mb-4"><ShieldAlert /><AlertTitle>Update failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}<form action={submit} className="grid gap-4"><div className="space-y-2"><Label>Display name</Label><Input name="display_name" defaultValue={staff.display_name} required /></div><div className="space-y-2"><Label>Role</Label><select name="role" defaultValue={staff.role_codes[0]} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{roles.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div><div className="space-y-2"><Label>Organization / district</Label><OrganizationTreeSelect name="organization_public_id" items={scopedOrganizations} defaultValue={staff.organization_public_id || ""} rootLabel="Select organization / district" help="Search and select the staff member's organization scope." /></div><div className="space-y-2"><Label>Account status</Label><select name="status" defaultValue={staff.status} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{["active", "suspended", "disabled", "locked"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div><div className="space-y-2"><Label>Designation</Label><Input name="designation" defaultValue={staff.designation || ""} /></div><div className="space-y-2"><Label>Service / staff number</Label><Input name="member_code" defaultValue={staff.member_code || ""} /></div><div className="space-y-2"><Label>Administrative reason</Label><Input name="reason" minLength={3} required /></div><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Save changes</Button></form></CardContent></Card>
}
