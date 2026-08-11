"use client"

import {
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
import type { AdminProvider, AdminProviderDetail } from "@/features/super-admin/provider-review"

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

function documentHref(provider: AdminProvider, documentId: string, storageKey: string, fileName: string | null) {
  const document = provider.documents.find((item) => item.id === documentId)
  if (!document || !storageKey) return null
  const params = new URLSearchParams({
    storageKey,
    fileName: fileName || `${document.document_type}.pdf`,
    download: "1",
  })
  return `/api/documents?${params.toString()}`
}

async function responseMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
  return body?.message || body?.detail || fallback
}

export function ProviderReviewManager({ detail }: { detail: AdminProviderDetail }) {
  const { provider } = detail
  const router = useRouter()
  const [decision, setDecision] = useState<ReviewDecision | null>(null)
  const [notes, setNotes] = useState(provider.review_notes || "")
  const [accountReason, setAccountReason] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function submitReview() {
    if (!decision) return
    if (decision !== "approve" && notes.trim().length < 3) {
      setError("Review notes are required for changes requests and rejection.")
      return
    }
    setPending("review")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/super-admin/approvals/provider/${provider.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: notes.trim() || null }),
      })
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to review provider."))
      setSuccess(`Provider review completed: ${label(decision)}.`)
      setDecision(null)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review provider.")
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
      !window.confirm(`Confirm that you want to ${action} this provider account?`)
    ) {
      return
    }
    setPending(action)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/super-admin/providers/${provider.id}/account-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: accountReason.trim() }),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to update provider account status."))
      }
      setSuccess(
        action === "activate"
          ? "Provider account activated."
          : `Provider account ${action}ed.`
      )
      setAccountReason("")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update provider account status.")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="destructive"><ShieldAlert /><AlertTitle>Action failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {success ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 /><AlertTitle>Provider updated</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Staff accounts", provider.provider_staff_count],
          ["Connected owners", provider.linked_owner_count],
          ["Registered devices", provider.registered_device_count],
          ["Active vehicles", provider.active_vehicle_count],
          ["Vehicles online", provider.online_vehicle_count],
          ["Account status", label(detail.account_status)],
        ].map(([title, value]) => (
          <Card key={String(title)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-3 text-3xl font-semibold">{value}</p></CardContent></Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>Provider application</CardTitle><p className="mt-1 text-sm text-muted-foreground">Legal, licence, contact, and registration information.</p></div><StatusBadge status={provider.status} /></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {[
                ["Legal name", provider.legal_name],
                ["Trade name", provider.trade_name],
                ["Application", provider.application_number],
                ["Provider code", provider.code],
                ["BTRC licence", provider.btrc_license_number],
                ["Trade licence", provider.trade_license_number],
                ["Company registration", provider.company_registration_number],
                ["District", provider.district],
                ["Phone", provider.phone],
                ["Email", provider.email],
                ["Submitted", formatDate(provider.submitted_at)],
                ["Last reviewed", formatDate(provider.reviewed_at)],
              ].map(([key, value]) => <div key={String(key)} className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-1 break-words font-medium">{value || "Not provided"}</p></div>)}
              <div className="md:col-span-2 rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Registered address</p><p className="mt-1 whitespace-pre-wrap font-medium">{provider.registered_address}</p></div>
            </CardContent>
          </Card>

          <AdministrativeHistory
            entries={detail.history}
            lastReason={detail.last_administrative_reason}
          />

          <Card>
            <CardHeader><CardTitle>Documents</CardTitle><p className="text-sm text-muted-foreground">Active application documents and verification state.</p></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {provider.documents.map((document) => {
                const href = documentHref(provider, document.id, document.storage_key, document.file_name)
                return <article key={document.id} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><FileText className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{label(document.document_type)}</p><Badge variant="outline">{label(document.status)}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{document.file_name || "Uploaded document"} · Version {document.version}</p>{document.review_notes ? <p className="mt-2 text-xs text-amber-800">{document.review_notes}</p> : null}</div></div>{href ? <Button asChild size="sm" variant="outline" className="mt-3 w-full"><a href={href}><Download /> Download document</a></Button> : null}</article>
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Staff, integration, and connected-owner overview</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Telemetry source</p><p className="mt-1 font-medium">{provider.telemetry_source_code || "Not provisioned"}</p><p className="mt-1 text-xs text-muted-foreground">Status: {label(provider.telemetry_source_status || provider.integration_status || "pending")}</p></div>
              <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Last telemetry</p><p className="mt-1 font-medium">{formatDate(provider.last_telemetry_received_at)}</p><p className="mt-1 text-xs text-muted-foreground">Interval: {provider.data_submission_interval_seconds ? `${provider.data_submission_interval_seconds} seconds` : "Not configured"}</p></div>
              <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Protocols</p><div className="mt-2 flex flex-wrap gap-2">{provider.supported_protocols.length ? provider.supported_protocols.map((item) => <Badge key={item} variant="outline">{item}</Badge>) : <span className="text-sm text-muted-foreground">None declared</span>}</div></div>
              <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Service coverage</p><div className="mt-2 flex flex-wrap gap-2">{provider.service_coverage.length ? provider.service_coverage.map((item) => <Badge key={item} variant="outline">{item}</Badge>) : <span className="text-sm text-muted-foreground">None declared</span>}</div></div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Administrative actions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Review the application or control the primary provider account.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="review-notes">Application review notes</Label>
                <Textarea
                  id="review-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                  placeholder="Record the approval, correction request, or rejection reason."
                />
              </div>

              {provider.status !== "suspended" ? <div className="grid gap-2"><Button type="button" variant="outline" className={decision === "approve" ? "border-emerald-500 bg-emerald-50" : ""} onClick={() => setDecision("approve")}><CheckCircle2 /> Approve</Button><Button type="button" variant="outline" className={decision === "request_changes" ? "border-amber-500 bg-amber-50" : ""} onClick={() => setDecision("request_changes")}><FileEdit /> Request changes</Button><Button type="button" variant="outline" className={decision === "reject" ? "border-rose-500 bg-rose-50" : ""} onClick={() => setDecision("reject")}><XCircle /> Reject</Button>{decision ? <Button type="button" disabled={pending !== null} onClick={() => void submitReview()} className="bg-emerald-800 text-white hover:bg-emerald-900">{pending === "review" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Submit review decision</Button> : null}</div> : null}

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="provider-account-reason">Account control reason</Label>
                  <Badge variant={detail.account_status === "active" ? "secondary" : "destructive"}>
                    {label(detail.account_status)}
                  </Badge>
                </div>
                <Textarea
                  id="provider-account-reason"
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
                        {pending === "suspend" ? <Loader2 className="animate-spin" /> : <UserRoundX />} Suspend provider
                      </Button>
                    </>
                  ) : null}
                  {detail.account_status === "locked" ? (
                    <>
                      <Button type="button" className="bg-emerald-800 text-white hover:bg-emerald-900" disabled={pending !== null} onClick={() => void updateAccount("activate")}>
                        {pending === "activate" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Activate account
                      </Button>
                      <Button type="button" variant="destructive" disabled={pending !== null} onClick={() => void updateAccount("suspend")}>
                        {pending === "suspend" ? <Loader2 className="animate-spin" /> : <UserRoundX />} Suspend provider
                      </Button>
                    </>
                  ) : null}
                  {detail.account_status === "suspended" ? (
                    <Button type="button" className="bg-emerald-800 text-white hover:bg-emerald-900" disabled={pending !== null} onClick={() => void updateAccount("activate")}>
                      {pending === "activate" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Reactivate provider
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
