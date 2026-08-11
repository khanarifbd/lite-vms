"use client"

import {
  Activity,
  BadgeCheck,
  KeyRound,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
  Wrench,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createProviderStaffSchema,
  resetProviderStaffPasswordSchema,
  updateProviderStaffSchema,
} from "@/features/provider/staff-schema"
import {
  PROVIDER_STAFF_ROLE_OPTIONS,
  type ProviderStaffMember,
  type ProviderStaffPage,
  type ProviderStaffStatus,
} from "@/features/provider/staff-types"

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

const initialCreateForm = {
  fullName: "",
  email: "",
  mobile: "",
  temporaryPassword: "",
  roleCode: "vts_operator" as const,
  employeeId: "",
  designation: "",
  isTechnicalContact: false,
}

const initialResetForm = {
  newPassword: "",
  reason: "",
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never"
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Never" : dateFormatter.format(date)
}

function roleLabel(roleCode: string, fallback: string) {
  if (roleCode === "vts_admin") {
    return "Provider Administrator"
  }
  return (
    PROVIDER_STAFF_ROLE_OPTIONS.find((option) => option.value === roleCode)?.label || fallback
  )
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "The request could not be completed."
    throw new Error(message)
  }
  return payload as T
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null
}

type ProviderStaffManagementProps = {
  initialData: ProviderStaffPage
  providerName: string
}

export function ProviderStaffManagement({
  initialData,
  providerName,
}: ProviderStaffManagementProps) {
  const [staff, setStaff] = useState(initialData.items)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ProviderStaffMember | null>(null)
  const [resetTarget, setResetTarget] = useState<ProviderStaffMember | null>(null)
  const [createForm, setCreateForm] = useState(initialCreateForm)
  const [editForm, setEditForm] = useState({
    displayName: "",
    email: "",
    mobile: "",
    roleCode: "vts_operator" as "vts_operator" | "vts_technical" | "vts_viewer",
    employeeId: "",
    designation: "",
    isTechnicalContact: false,
    status: "active" as ProviderStaffStatus,
  })
  const [resetForm, setResetForm] = useState(initialResetForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return staff.filter((member) => {
      const matchesStatus = statusFilter === "all" || member.user_status === statusFilter
      const haystack = [
        member.display_name,
        member.email,
        member.mobile,
        member.employee_id,
        member.designation,
        member.role_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return matchesStatus && (!query || haystack.includes(query))
    })
  }, [search, staff, statusFilter])

  const metrics = useMemo(
    () => ({
      total: staff.length,
      active: staff.filter((member) => member.user_status === "active").length,
      technical: staff.filter((member) => member.is_technical_contact).length,
      passwordChange: staff.filter((member) => member.must_change_password).length,
    }),
    [staff]
  )

  const openEdit = (member: ProviderStaffMember) => {
    if (member.is_primary_admin) {
      return
    }
    const roleCode = PROVIDER_STAFF_ROLE_OPTIONS.some(
      (option) => option.value === member.role_code
    )
      ? (member.role_code as "vts_operator" | "vts_technical" | "vts_viewer")
      : "vts_viewer"
    setErrors({})
    setEditForm({
      displayName: member.display_name,
      email: member.email || "",
      mobile: member.mobile || "",
      roleCode,
      employeeId: member.employee_id || "",
      designation: member.designation || "",
      isTechnicalContact: member.is_technical_contact,
      status:
        member.user_status === "suspended" || member.user_status === "disabled"
          ? member.user_status
          : "active",
    })
    setEditTarget(member)
  }

  const openReset = (member: ProviderStaffMember) => {
    if (member.is_primary_admin) {
      return
    }
    setErrors({})
    setResetForm(initialResetForm)
    setResetTarget(member)
  }

  const validate = (result: ReturnType<typeof createProviderStaffSchema.safeParse>) => {
    if (result.success) {
      setErrors({})
      return true
    }
    const next: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] || "root")
      if (!next[key]) {
        next[key] = issue.message
      }
    }
    setErrors(next)
    return false
  }

  const submitCreate = async () => {
    const parsed = createProviderStaffSchema.safeParse(createForm)
    if (!validate(parsed)) {
      return
    }

    setSubmitting(true)
    try {
      const member = await parseResponse<ProviderStaffMember>(
        await fetch("/api/provider/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createForm),
        })
      )
      setStaff((current) => [member, ...current])
      setCreateOpen(false)
      setCreateForm(initialCreateForm)
      toast.success("Staff account created", {
        description: `${member.display_name} must change the temporary password at first login.`,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create staff account.")
    } finally {
      setSubmitting(false)
    }
  }

  const submitEdit = async () => {
    if (!editTarget) {
      return
    }
    const parsed = updateProviderStaffSchema.safeParse(editForm)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] || "root")
        if (!next[key]) {
          next[key] = issue.message
        }
      }
      setErrors(next)
      return
    }

    setSubmitting(true)
    try {
      const member = await parseResponse<ProviderStaffMember>(
        await fetch(`/api/provider/staff/${editTarget.user_public_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        })
      )
      setStaff((current) =>
        current.map((item) =>
          item.user_public_id === member.user_public_id ? member : item
        )
      )
      setEditTarget(null)
      toast.success("Staff details updated", {
        description: `${member.display_name}'s access settings are now current.`,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update staff account.")
    } finally {
      setSubmitting(false)
    }
  }

  const submitReset = async () => {
    if (!resetTarget) {
      return
    }
    const parsed = resetProviderStaffPasswordSchema.safeParse(resetForm)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] || "root")
        if (!next[key]) {
          next[key] = issue.message
        }
      }
      setErrors(next)
      return
    }

    setSubmitting(true)
    try {
      const result = await parseResponse<{ message: string }>(
        await fetch(`/api/provider/staff/${resetTarget.user_public_id}/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resetForm),
        })
      )
      setStaff((current) =>
        current.map((member) =>
          member.user_public_id === resetTarget.user_public_id
            ? { ...member, must_change_password: true }
            : member
        )
      )
      setResetTarget(null)
      toast.success("Temporary password updated", { description: result.message })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset password.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
        <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              Provider administration
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Staff & access management
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
              Create scoped accounts for {providerName}, assign operational roles, and
              control access without exposing other provider data.
            </p>
          </div>
          <Button
            type="button"
            className="bg-white text-emerald-950 hover:bg-emerald-50"
            onClick={() => {
              setErrors({})
              setCreateForm(initialCreateForm)
              setCreateOpen(true)
            }}
          >
            <UserPlus aria-hidden="true" />
            Add staff member
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Team members", value: metrics.total, icon: UsersRound },
          { label: "Active accounts", value: metrics.active, icon: BadgeCheck },
          { label: "Technical contacts", value: metrics.technical, icon: Wrench },
          { label: "Password change due", value: metrics.passwordChange, icon: KeyRound },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-3 text-3xl font-semibold">{value}</p>
              </div>
              <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                <Icon className="size-5" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Authorized provider team</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} visible account{filtered.length === 1 ? "" : "s"} from {staff.length} total.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, employee ID..."
                className="pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-8 rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
              aria-label="Filter staff status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden lg:table-cell">Employee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden xl:table-cell">Last login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((member) => (
                    <TableRow key={member.user_public_id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-10">
                            <AvatarFallback className="bg-emerald-100 text-xs font-semibold text-emerald-800">
                              {initials(member.display_name) || "ST"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="max-w-64 truncate font-medium">{member.display_name}</p>
                              {member.is_primary_admin ? (
                                <Badge variant="secondary">Primary admin</Badge>
                              ) : null}
                              {member.is_technical_contact ? (
                                <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                                  Technical
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground">
                              {member.email || member.mobile || "No login identifier"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{roleLabel(member.role_code, member.role_name)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {member.designation || "No designation"}
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <p>{member.employee_id || "—"}</p>
                        {member.must_change_password ? (
                          <p className="mt-0.5 text-xs text-amber-700">Password change required</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={member.user_status} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {formatDate(member.last_login_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(member)}
                            disabled={member.is_primary_admin}
                          >
                            <Pencil aria-hidden="true" />
                            <span className="hidden 2xl:inline">Edit</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => openReset(member)}
                            disabled={member.is_primary_admin}
                          >
                            <KeyRound aria-hidden="true" />
                            <span className="hidden 2xl:inline">Password</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                <UsersRound className="size-7" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No matching staff accounts</h3>
              <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                Change the search or status filter, or add a new provider team member.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => !submitting && setCreateOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add provider staff member</DialogTitle>
            <DialogDescription>
              Create a tenant-scoped account. The user must replace the temporary password
              at first login.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="create-name">Full name</Label>
              <Input
                id="create-name"
                value={createForm.fullName}
                onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))}
                disabled={submitting}
              />
              <FieldError message={errors.fullName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                disabled={submitting}
              />
              <FieldError message={errors.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-mobile">Mobile (optional)</Label>
              <Input
                id="create-mobile"
                value={createForm.mobile}
                onChange={(event) => setCreateForm((current) => ({ ...current, mobile: event.target.value }))}
                placeholder="+8801712345678"
                disabled={submitting}
              />
              <FieldError message={errors.mobile} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-employee">Employee ID</Label>
              <Input
                id="create-employee"
                value={createForm.employeeId}
                onChange={(event) => setCreateForm((current) => ({ ...current, employeeId: event.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-designation">Designation</Label>
              <Input
                id="create-designation"
                value={createForm.designation}
                onChange={(event) => setCreateForm((current) => ({ ...current, designation: event.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="create-role">Access role</Label>
              <select
                id="create-role"
                value={createForm.roleCode}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    roleCode: event.target.value as typeof current.roleCode,
                  }))
                }
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
                disabled={submitting}
              >
                {PROVIDER_STAFF_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-muted-foreground">
                {PROVIDER_STAFF_ROLE_OPTIONS.find((option) => option.value === createForm.roleCode)?.description}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="create-password">Temporary password</Label>
              <Input
                id="create-password"
                type="password"
                autoComplete="new-password"
                value={createForm.temporaryPassword}
                onChange={(event) => setCreateForm((current) => ({ ...current, temporaryPassword: event.target.value }))}
                disabled={submitting}
              />
              <FieldError message={errors.temporaryPassword} />
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border bg-slate-50 p-3 sm:col-span-2">
              <input
                type="checkbox"
                checked={createForm.isTechnicalContact}
                onChange={(event) => setCreateForm((current) => ({ ...current, isTechnicalContact: event.target.checked }))}
                className="size-4 accent-emerald-700"
                disabled={submitting}
              />
              <span>
                <span className="block text-sm font-medium">Mark as technical contact</span>
                <span className="block text-xs text-muted-foreground">
                  Identifies the person responsible for platform and telemetry communication.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={submitting} className="bg-emerald-800 text-white hover:bg-emerald-900">
              {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {submitting ? "Creating..." : "Create staff account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && !submitting && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit staff access</DialogTitle>
            <DialogDescription>
              Changes to role or account status revoke existing sessions immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-name">Full name</Label>
              <Input id="edit-name" value={editForm.displayName} onChange={(event) => setEditForm((current) => ({ ...current, displayName: event.target.value }))} disabled={submitting} />
              <FieldError message={errors.displayName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} disabled={submitting} />
              <FieldError message={errors.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-mobile">Mobile</Label>
              <Input id="edit-mobile" value={editForm.mobile} onChange={(event) => setEditForm((current) => ({ ...current, mobile: event.target.value }))} disabled={submitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-employee">Employee ID</Label>
              <Input id="edit-employee" value={editForm.employeeId} onChange={(event) => setEditForm((current) => ({ ...current, employeeId: event.target.value }))} disabled={submitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-designation">Designation</Label>
              <Input id="edit-designation" value={editForm.designation} onChange={(event) => setEditForm((current) => ({ ...current, designation: event.target.value }))} disabled={submitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Access role</Label>
              <select id="edit-role" value={editForm.roleCode} onChange={(event) => setEditForm((current) => ({ ...current, roleCode: event.target.value as typeof current.roleCode }))} className="h-9 w-full rounded-lg border bg-background px-3 text-sm" disabled={submitting}>
                {PROVIDER_STAFF_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Account status</Label>
              <select id="edit-status" value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value as ProviderStaffStatus }))} className="h-9 w-full rounded-lg border bg-background px-3 text-sm" disabled={submitting}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border bg-slate-50 p-3 sm:col-span-2">
              <input type="checkbox" checked={editForm.isTechnicalContact} onChange={(event) => setEditForm((current) => ({ ...current, isTechnicalContact: event.target.checked }))} className="size-4 accent-emerald-700" disabled={submitting} />
              <span className="text-sm font-medium">Technical contact</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitEdit} disabled={submitting} className="bg-emerald-800 text-white hover:bg-emerald-900">
              {submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {submitting ? "Saving..." : "Save access changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetTarget)} onOpenChange={(open) => !open && !submitting && setResetTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reset temporary password</DialogTitle>
            <DialogDescription>
              All active sessions for {resetTarget?.display_name} will be revoked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-password">New temporary password</Label>
              <Input id="reset-password" type="password" autoComplete="new-password" value={resetForm.newPassword} onChange={(event) => setResetForm((current) => ({ ...current, newPassword: event.target.value }))} disabled={submitting} />
              <FieldError message={errors.newPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-reason">Reason (optional)</Label>
              <Input id="reset-reason" value={resetForm.reason} onChange={(event) => setResetForm((current) => ({ ...current, reason: event.target.value }))} placeholder="For audit history" disabled={submitting} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitReset} disabled={submitting} className="bg-amber-600 text-white hover:bg-amber-700">
              {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
              {submitting ? "Resetting..." : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-emerald-900/10 bg-emerald-950 text-white">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-200">
            <Activity className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold">Tenant isolation enforced</p>
            <p className="mt-1 text-sm leading-6 text-emerald-100/70">
              Provider administrators can manage only accounts belonging to their approved
              provider tenant. Role changes and account suspension are recorded in the audit log.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
