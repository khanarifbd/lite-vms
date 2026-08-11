"use client"

import {
  CheckCircle2,
  ClipboardCheck,
  History,
  Loader2,
  LockKeyhole,
  Pencil,
  Save,
  ShieldAlert,
  UserRoundX,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AdminDriverDetail } from "@/features/super-admin/drivers"

type AccountAction = "activate" | "lock" | "suspend"
type ProfileReviewDecision = "approve" | "request_changes" | "reject"
type ProfileForm = {
  full_name: string
  mobile: string
  email: string
  date_of_birth: string
  father_name: string
  mother_name: string
  gender: string
  blood_group: string
  district: string
  emergency_contact_name: string
  emergency_contact_phone: string
  employment_type: string
  medical_fitness_expiry_date: string
  present_address: string
  permanent_address: string
  shift_information: string
}

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function label(value: string) {
  return value.replace(/^driver\./, "").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Unknown time" : dateFormatter.format(date)
}

function responseMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback
  const value = body as { message?: string; detail?: string }
  return value.message || value.detail || fallback
}

function proposedValue(field: string, value: unknown) {
  if (field === "documents" && Array.isArray(value)) {
    return `${value.length} submitted document${value.length === 1 ? "" : "s"}`
  }
  if (Array.isArray(value)) return value.join(", ")
  if (value === null || value === "") return "Not provided"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return "Updated structured information"
  return String(value)
}

function initialProfile(detail: AdminDriverDetail): ProfileForm {
  const driver = detail.driver
  return {
    full_name: driver.full_name,
    mobile: driver.mobile,
    email: driver.email,
    date_of_birth: driver.date_of_birth || "",
    father_name: driver.father_name || "",
    mother_name: driver.mother_name || "",
    gender: driver.gender || "",
    blood_group: driver.blood_group || "",
    district: driver.district,
    emergency_contact_name: driver.emergency_contact_name || "",
    emergency_contact_phone: driver.emergency_contact_phone || "",
    employment_type: driver.employment_type || "",
    medical_fitness_expiry_date: driver.medical_fitness_expiry_date || "",
    present_address: driver.present_address,
    permanent_address: driver.permanent_address || "",
    shift_information: driver.shift_information || "",
  }
}

export function DriverAdminManager({ detail }: { detail: AdminDriverDetail }) {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileForm>(() => initialProfile(detail))
  const [profileNote, setProfileNote] = useState("")
  const [statusReason, setStatusReason] = useState("")
  const [profileReviewNote, setProfileReviewNote] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function updateField(field: keyof ProfileForm, value: string) {
    setProfile((current) => ({ ...current, [field]: value }))
  }

  async function updateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (profileNote.trim().length < 3) {
      setError("A change note of at least 3 characters is required.")
      return
    }
    setPending("profile")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/super-admin/drivers/${detail.driver.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          date_of_birth: profile.date_of_birth || null,
          father_name: profile.father_name || null,
          mother_name: profile.mother_name || null,
          gender: profile.gender || null,
          blood_group: profile.blood_group || null,
          emergency_contact_name: profile.emergency_contact_name || null,
          emergency_contact_phone: profile.emergency_contact_phone || null,
          employment_type: profile.employment_type || null,
          medical_fitness_expiry_date: profile.medical_fitness_expiry_date || null,
          permanent_address: profile.permanent_address || null,
          shift_information: profile.shift_information || null,
          change_note: profileNote.trim(),
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseMessage(body, "Unable to update the driver profile."))
      setSuccess("Driver profile updated and the change was added to the audit history.")
      setProfileNote("")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the driver profile.")
    } finally {
      setPending(null)
    }
  }

  async function reviewProfileChange(decision: ProfileReviewDecision) {
    if (profileReviewNote.trim().length < 3) {
      setError("Enter a Police review note of at least 3 characters.")
      return
    }
    const pendingKey = `profile-review-${decision}`
    setPending(pendingKey)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(
        `/api/super-admin/drivers/${detail.driver.id}/profile-change-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, notes: profileReviewNote.trim() }),
        }
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(responseMessage(body, "Unable to review the profile change."))
      }
      setSuccess(
        decision === "approve"
          ? "Profile change approved without resetting Driver verification."
          : decision === "request_changes"
            ? "Profile change returned to the Driver for correction."
            : "Profile change rejected; the verified record remains unchanged."
      )
      setProfileReviewNote("")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review the profile change.")
    } finally {
      setPending(null)
    }
  }

  async function updateAccount(action: AccountAction) {
    if (statusReason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters before changing account status.")
      return
    }
    if (
      (action === "lock" || action === "suspend") &&
      !window.confirm(`Confirm that you want to ${action} this driver account?`)
    ) {
      return
    }
    setPending(action)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/super-admin/drivers/${detail.driver.id}/account-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: statusReason.trim() }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseMessage(body, "Unable to update the driver account."))
      setSuccess(responseMessage(body, `Driver account ${action} completed.`))
      setStatusReason("")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the driver account.")
    } finally {
      setPending(null)
    }
  }

  const inputFields: Array<{ field: keyof ProfileForm; title: string; type?: string }> = [
    { field: "full_name", title: "Full name" },
    { field: "mobile", title: "Mobile", type: "tel" },
    { field: "email", title: "Email", type: "email" },
    { field: "date_of_birth", title: "Date of birth", type: "date" },
    { field: "father_name", title: "Father's name" },
    { field: "mother_name", title: "Mother's name" },
    { field: "gender", title: "Gender" },
    { field: "blood_group", title: "Blood group" },
    { field: "district", title: "District" },
    { field: "emergency_contact_name", title: "Emergency contact" },
    { field: "emergency_contact_phone", title: "Emergency mobile", type: "tel" },
    { field: "employment_type", title: "Employment type" },
    { field: "medical_fitness_expiry_date", title: "Medical fitness expiry", type: "date" },
  ]

  return (
    <section className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>Driver updated</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      {detail.driver.profile_change_status === "pending" && detail.pending_profile_changes ? (
        <Card className="border-sky-200 bg-sky-50/40">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="size-5 text-sky-700" /> Driver profile change review
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review only the proposed values. The verified Driver record remains active until approval.
                </p>
              </div>
              <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">Pending review</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(detail.pending_profile_changes)
                .filter(([field]) => field !== "declaration_accepted")
                .map(([field, value]) => (
                  <div key={field} className="rounded-xl border bg-white p-3">
                    <p className="text-xs text-muted-foreground">{label(field)}</p>
                    <p className="mt-1 break-words text-sm font-medium">
                      {proposedValue(field, value)}
                    </p>
                  </div>
                ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-profile-review-note">Required Police review note</Label>
              <Textarea
                id="driver-profile-review-note"
                value={profileReviewNote}
                onChange={(event) => setProfileReviewNote(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Record what was checked and why this change is approved, returned, or rejected."
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending !== null}
                onClick={() => void reviewProfileChange("request_changes")}
              >
                {pending === "profile-review-request_changes" ? <Loader2 className="animate-spin" /> : <Pencil />}
                Request changes
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending !== null}
                onClick={() => void reviewProfileChange("reject")}
              >
                {pending === "profile-review-reject" ? <Loader2 className="animate-spin" /> : <XCircle />}
                Reject
              </Button>
              <Button
                type="button"
                disabled={pending !== null}
                className="bg-emerald-800 text-white hover:bg-emerald-900"
                onClick={() => void reviewProfileChange("approve")}
              >
                {pending === "profile-review-approve" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Approve profile change
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Account control</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Lock, suspend, or restore access. Every action requires a reason.</p>
              </div>
              <Badge variant={detail.account_status === "active" ? "secondary" : "destructive"}>
                {label(detail.account_status)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {detail.last_administrative_reason ? (
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest administrative note</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{detail.last_administrative_reason}</p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="driver-status-reason">Required reason / note</Label>
              <Textarea
                id="driver-status-reason"
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="Record why access is being locked, suspended, or restored."
              />
              <p className="text-right text-xs text-muted-foreground">{statusReason.length}/2000</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {detail.account_status === "active" ? (
                <>
                  <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void updateAccount("lock")}>
                    {pending === "lock" ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Lock account
                  </Button>
                  <Button type="button" variant="destructive" disabled={pending !== null} onClick={() => void updateAccount("suspend")}>
                    {pending === "suspend" ? <Loader2 className="animate-spin" /> : <UserRoundX />} Suspend account
                  </Button>
                </>
              ) : null}
              {detail.account_status === "locked" ? (
                <>
                  <Button type="button" className="bg-emerald-800 text-white hover:bg-emerald-900" disabled={pending !== null} onClick={() => void updateAccount("activate")}>
                    {pending === "activate" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Activate account
                  </Button>
                  <Button type="button" variant="destructive" disabled={pending !== null} onClick={() => void updateAccount("suspend")}>
                    {pending === "suspend" ? <Loader2 className="animate-spin" /> : <UserRoundX />} Suspend account
                  </Button>
                </>
              ) : null}
              {detail.account_status === "suspended" ? (
                <Button type="button" className="sm:col-span-2 bg-emerald-800 text-white hover:bg-emerald-900" disabled={pending !== null} onClick={() => void updateAccount("activate")}>
                  {pending === "activate" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Reactivate account
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="size-5 text-emerald-700" /> Administrative history</CardTitle>
            <p className="text-sm text-muted-foreground">Newest audited profile and account changes. Up to 50 entries are retained here.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.history.length ? detail.history.slice(0, 8).map((entry) => {
              const changedFields = Object.keys(entry.new_values || {}).filter((field) => field !== "reason")
              return (
                <article key={entry.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{label(entry.action)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{entry.actor_name || "System administrator"} · {formatDate(entry.created_at)}</p>
                    </div>
                    {changedFields.length ? <Badge variant="outline">{changedFields.length} field{changedFields.length === 1 ? "" : "s"}</Badge> : null}
                  </div>
                  {entry.reason ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{entry.reason}</p> : null}
                  {changedFields.length ? <p className="mt-2 text-xs text-muted-foreground">Changed: {changedFields.map(label).join(", ")}</p> : null}
                </article>
              )
            }) : (
              <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">No administrative changes have been recorded yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <details className="group rounded-2xl border bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold">
          <span className="flex items-center gap-2"><Pencil className="size-4 text-emerald-700" /> Edit driver profile</span>
          <Badge variant="outline">Audited update</Badge>
        </summary>
        <form onSubmit={updateProfile} className="border-t p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {inputFields.map(({ field, title, type }) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`driver-${field}`}>{title}</Label>
                <Input
                  id={`driver-${field}`}
                  type={type || "text"}
                  value={profile[field]}
                  onChange={(event) => updateField(field, event.target.value)}
                  required={["full_name", "mobile", "email", "district"].includes(field)}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {([
              ["present_address", "Present address"],
              ["permanent_address", "Permanent address"],
              ["shift_information", "Shift information"],
            ] as Array<[keyof ProfileForm, string]>).map(([field, title]) => (
              <div key={field} className={field === "shift_information" ? "space-y-2 md:col-span-2" : "space-y-2"}>
                <Label htmlFor={`driver-${field}`}>{title}</Label>
                <Textarea
                  id={`driver-${field}`}
                  value={profile[field]}
                  onChange={(event) => updateField(field, event.target.value)}
                  rows={4}
                  required={field === "present_address"}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="driver-profile-note">Required change note</Label>
            <Textarea
              id="driver-profile-note"
              value={profileNote}
              onChange={(event) => setProfileNote(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Explain what was corrected and the source of the information."
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={pending !== null} className="bg-emerald-800 text-white hover:bg-emerald-900">
              {pending === "profile" ? <Loader2 className="animate-spin" /> : <Save />} Save audited profile
            </Button>
          </div>
        </form>
      </details>
    </section>
  )
}
