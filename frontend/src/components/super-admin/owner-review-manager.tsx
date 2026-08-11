"use client"

import {
  Building2,
  CarFront,
  CheckCircle2,
  Download,
  FileEdit,
  FileText,
  Loader2,
  LockKeyhole,
  ShieldAlert,
  UserRoundX,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { AdministrativeHistory } from "@/components/super-admin/administrative-history"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AdminOwnerDetail } from "@/features/super-admin/owner-review"

type ReviewDecision = "approve" | "request_changes" | "reject"
type AccountAction = "activate" | "lock" | "suspend"

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

function documentHref(storageKey: string, fileName: string | null, documentType: string) {
  if (!storageKey) return null
  const params = new URLSearchParams({
    storageKey,
    fileName: fileName || `${documentType}.pdf`,
    download: "1",
  })
  return `/api/documents?${params.toString()}`
}

async function responseMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
  return body?.message || body?.detail || fallback
}

export function OwnerReviewManager({ detail }: { detail: AdminOwnerDetail }) {
  const { owner, vehicles } = detail
  const router = useRouter()
  const [decision, setDecision] = useState<ReviewDecision | null>(null)
  const [notes, setNotes] = useState(owner.review_notes || "")
  const [accountReason, setAccountReason] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function submitReview() {
    if (!decision) return
    if (notes.trim().length < 3) {
      setError("Review notes are required for the owner review decision.")
      return
    }
    setPending("review")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/super-admin/approvals/owner/${owner.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: notes.trim() }),
      })
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to review owner."))
      setSuccess(`Owner review completed: ${label(decision)}.`)
      setDecision(null)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review owner.")
    } finally {
      setPending(null)
    }
  }

  async function updateAccount(action: AccountAction) {
    if (accountReason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters before changing account status.")
      return
    }
    if (
      (action === "lock" || action === "suspend") &&
      !window.confirm(`Confirm that you want to ${action} this vehicle-owner account?`)
    ) {
      return
    }
    setPending(action)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/super-admin/owners/${owner.id}/account-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: accountReason.trim() }),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to update owner account status."))
      }
      setSuccess(
        action === "activate"
          ? "Vehicle-owner account activated."
          : `Vehicle-owner account ${action}ed.`
      )
      setAccountReason("")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update owner account status.")
    } finally {
      setPending(null)
    }
  }

  const profileRows = owner.owner_type === "individual"
    ? [
        ["Date of birth", owner.date_of_birth],
        ["Father's name", owner.father_name],
        ["Mother's name", owner.mother_name],
        ["Gender", owner.gender],
        ["Division", owner.division],
        ["Upazila", owner.upazila],
        ["Postal code", owner.postal_code],
        ["Alternate mobile", owner.alternate_phone],
      ]
    : [
        ["Company type", owner.company_type],
        ["Incorporation date", owner.incorporation_date],
        ["Trade licence", owner.trade_license_number],
        ["TIN", owner.tin_number],
        ["BIN", owner.bin_number],
        ["Authorized person", owner.authorized_person_name],
        ["Authorized designation", owner.authorized_person_designation],
        ["Authorized mobile", owner.authorized_person_mobile],
      ]

  return (
    <div className="space-y-6">
      {error ? <Alert variant="destructive"><ShieldAlert /><AlertTitle>Action failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {success ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 /><AlertTitle>Owner updated</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Registered vehicles", owner.total_vehicles],
          ["Active vehicles", owner.active_vehicles],
          ["Connected providers", owner.linked_providers.length],
          ["Active providers", owner.active_vts_providers_count],
          ["Account status", label(detail.account_status || owner.account_status || owner.status)],
        ].map(([title, value]) => (
          <Card key={String(title)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-3 text-2xl font-semibold">{value}</p></CardContent></Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>{owner.owner_type === "individual" ? "Individual owner application" : "Company owner application"}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Identity, account, contact, and submitted profile information.</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{label(owner.owner_type)}</Badge><StatusBadge status={owner.verification_status} /></div></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {[
                ["Owner name", owner.owner_name],
                ["Application", owner.application_number],
                ["Owner code", owner.owner_code],
                ["Mobile / identity reference", owner.identity_or_registration_reference],
                ["Contact mobile", owner.phone],
                ["Email", owner.email],
                ["Username", owner.account_username],
                ["Claim status", label(owner.claim_status)],
                ["District", owner.district],
                ["Created by provider", owner.created_by_provider_name],
                ["Submitted", formatDate(owner.submitted_at)],
                ["Last reviewed", formatDate(owner.reviewed_at)],
              ].map(([key, value]) => <div key={String(key)} className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-1 break-words font-medium">{value || "Not provided"}</p></div>)}
              <div className="md:col-span-2 rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Registered address</p><p className="mt-1 whitespace-pre-wrap font-medium">{owner.registered_address || "Not provided"}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Profile details</CardTitle><p className="text-sm text-muted-foreground">Fields vary according to individual or company registration.</p></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {profileRows.map(([key, value]) => <div key={String(key)} className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-1 break-words font-medium">{value || "Not provided"}</p></div>)}
              {owner.owner_type === "individual" ? <><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Present address</p><p className="mt-1 whitespace-pre-wrap font-medium">{owner.present_address || "Not provided"}</p></div><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Permanent address</p><p className="mt-1 whitespace-pre-wrap font-medium">{owner.permanent_address || "Not provided"}</p></div></> : <><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Head office</p><p className="mt-1 whitespace-pre-wrap font-medium">{owner.head_office_address || "Not provided"}</p></div><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Operating address</p><p className="mt-1 whitespace-pre-wrap font-medium">{owner.operating_address || "Not provided"}</p></div></>}
            </CardContent>
          </Card>

          <AdministrativeHistory
            entries={detail.history}
            lastReason={detail.last_administrative_reason}
          />

          <Card>
            <CardHeader><CardTitle>Owner documents</CardTitle><p className="text-sm text-muted-foreground">Active document versions, verification status, and police review notes.</p></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {owner.documents.length ? owner.documents.map((document) => {
                const href = documentHref(document.storage_key, document.file_name, document.document_type)
                return <article key={document.id} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><FileText className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{label(document.document_type)}</p><Badge variant="outline">{label(document.status)}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{document.file_name || "Uploaded document"} · Version {document.version}</p>{document.review_notes ? <p className="mt-2 text-xs text-amber-800">{document.review_notes}</p> : null}</div></div>{href ? <Button asChild size="sm" variant="outline" className="mt-3 w-full"><a href={href}><Download /> Download document</a></Button> : null}</article>
              }) : <div className="md:col-span-2 rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">No owner documents uploaded.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Connected VTS providers</CardTitle><p className="text-sm text-muted-foreground">Current provider connections and consent status.</p></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {owner.linked_providers.length ? owner.linked_providers.map((provider) => <article key={provider.provider_id} className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-start gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><Building2 className="size-4" /></div><div><p className="font-medium">{provider.provider_name}</p><p className="mt-1 text-xs text-muted-foreground">{provider.provider_code}</p><Badge variant="outline" className="mt-2">{label(provider.status)}</Badge></div></div></article>) : <div className="md:col-span-2 rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">No provider connections.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Owner vehicles</CardTitle><p className="text-sm text-muted-foreground">All vehicles registered under this national owner record.</p></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {vehicles.length ? vehicles.map((vehicle) => <article key={vehicle.id} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><CarFront className="size-4" /></div><div className="min-w-0 flex-1"><p className="font-medium">{vehicle.registration_number_display || vehicle.registration_number}</p><p className="mt-1 text-xs text-muted-foreground">{[vehicle.brand, vehicle.model, vehicle.vehicle_type].filter(Boolean).join(" · ")}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{label(vehicle.verification_status)}</Badge><Badge variant="outline">{label(vehicle.status)}</Badge></div></div></div><Button asChild size="sm" variant="outline" className="mt-3 w-full"><Link href={`/super-admin/approvals?tab=vehicles&search=${encodeURIComponent(vehicle.registration_number)}`}><CarFront /> Open vehicle review</Link></Button></article>) : <div className="md:col-span-2 rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">No vehicles registered.</div>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Administrative actions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Review the application or control the vehicle-owner account.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="owner-review-notes">Application review notes</Label>
                <Textarea
                  id="owner-review-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                  placeholder="Record the approval, correction request, or rejection reason."
                />
              </div>

              {owner.verification_status !== "suspended" ? <div className="grid gap-2"><Button type="button" variant="outline" className={decision === "approve" ? "border-emerald-500 bg-emerald-50" : ""} onClick={() => setDecision("approve")}><CheckCircle2 /> Approve</Button><Button type="button" variant="outline" className={decision === "request_changes" ? "border-amber-500 bg-amber-50" : ""} onClick={() => setDecision("request_changes")}><FileEdit /> Request changes</Button><Button type="button" variant="outline" className={decision === "reject" ? "border-rose-500 bg-rose-50" : ""} onClick={() => setDecision("reject")}><XCircle /> Reject</Button>{decision ? <Button type="button" disabled={pending !== null} onClick={() => void submitReview()} className="bg-emerald-800 text-white hover:bg-emerald-900">{pending === "review" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Submit review decision</Button> : null}</div> : null}

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="owner-account-reason">Account control reason</Label>
                  <Badge variant={detail.account_status === "active" ? "secondary" : "destructive"}>
                    {label(detail.account_status || owner.account_status || owner.status)}
                  </Badge>
                </div>
                <Textarea
                  id="owner-account-reason"
                  value={accountReason}
                  onChange={(event) => setAccountReason(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Required reason for locking, suspending, or activating access."
                />
                <div className="grid gap-2">
                  {detail.account_status === "active" ? (
                    <>
                      <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void updateAccount("lock")}>
                        {pending === "lock" ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Lock account
                      </Button>
                      <Button type="button" variant="destructive" disabled={pending !== null} onClick={() => void updateAccount("suspend")}>
                        {pending === "suspend" ? <Loader2 className="animate-spin" /> : <UserRoundX />} Suspend owner
                      </Button>
                    </>
                  ) : null}
                  {detail.account_status === "locked" ? (
                    <>
                      <Button type="button" className="bg-emerald-800 text-white hover:bg-emerald-900" disabled={pending !== null} onClick={() => void updateAccount("activate")}>
                        {pending === "activate" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Activate account
                      </Button>
                      <Button type="button" variant="destructive" disabled={pending !== null} onClick={() => void updateAccount("suspend")}>
                        {pending === "suspend" ? <Loader2 className="animate-spin" /> : <UserRoundX />} Suspend owner
                      </Button>
                    </>
                  ) : null}
                  {detail.account_status === "suspended" ? (
                    <Button type="button" className="bg-emerald-800 text-white hover:bg-emerald-900" disabled={pending !== null} onClick={() => void updateAccount("activate")}>
                      {pending === "activate" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Reactivate owner
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
