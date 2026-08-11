"use client"

import {
  CheckCircle2,
  Download,
  FileEdit,
  FileText,
  History,
  Loader2,
  QrCode,
  ShieldAlert,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AdminVehicleDetail } from "@/features/super-admin/vehicle-review"

type ReviewDecision = "approve" | "request_changes" | "reject"

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

function documentHref(storageKey: string | null, fileName: string | null, documentType: string) {
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

export function VehicleReviewManager({ detail }: { detail: AdminVehicleDetail }) {
  const { vehicle, qr, review_history: history } = detail
  const router = useRouter()
  const [decision, setDecision] = useState<ReviewDecision | null>(null)
  const [notes, setNotes] = useState(vehicle.review_notes || "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function submitReview() {
    if (!decision) return
    if (notes.trim().length < 3) {
      setError("Review notes are required.")
      return
    }
    setPending(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/super-admin/vehicles/${vehicle.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: notes.trim() }),
      })
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to review vehicle."))
      setSuccess(`Vehicle review completed: ${label(decision)}.`)
      setDecision(null)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review vehicle.")
    } finally {
      setPending(false)
    }
  }

  const identityRows = [
    ["Registration number", vehicle.registration_number_display || vehicle.registration_number],
    ["Chassis number", vehicle.chassis_number],
    ["Engine number", vehicle.engine_number],
    ["Vehicle type", vehicle.vehicle_type],
    ["Category", vehicle.vehicle_category],
    ["Usage type", vehicle.usage_type],
    ["Brand / model", [vehicle.brand, vehicle.model].filter(Boolean).join(" · ")],
    ["Manufacturing year", vehicle.manufacturing_year],
    ["Registration authority", vehicle.registration_authority],
    ["Registration date", vehicle.registration_date],
    ["Fuel type", vehicle.fuel_type],
    ["Color", vehicle.color],
  ]

  return (
    <div className="space-y-6">
      {error ? <Alert variant="destructive"><ShieldAlert /><AlertTitle>Review failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {success ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 /><AlertTitle>Vehicle updated</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Verification</p><div className="mt-3"><StatusBadge status={vehicle.verification_status} /></div></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Documents</p><p className="mt-3 text-3xl font-semibold">{vehicle.documents.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">GPS status</p><p className="mt-3 text-2xl font-semibold">{vehicle.gps_online ? "Online" : "Offline"}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Tracking provider</p><p className="mt-3 truncate text-lg font-semibold">{vehicle.tracking_provider_name || "Not connected"}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">QR credential</p><p className="mt-3 text-2xl font-semibold">{qr.is_active ? "Active" : "Inactive"}</p></CardContent></Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Vehicle identity and registration</CardTitle><p className="text-sm text-muted-foreground">Validate registration, chassis, engine, technical, and registration-authority data.</p></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {identityRows.map(([key, value]) => <div key={String(key)} className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-1 break-words font-medium">{String(value || "Not provided")}</p></div>)}
              <div className="md:col-span-2 rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Review notes</p><p className="mt-1 whitespace-pre-wrap font-medium">{vehicle.review_notes || "No previous review notes"}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Owner and registration source</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Vehicle owner</p><p className="mt-1 font-medium">{vehicle.owner.owner_name}</p><p className="mt-1 text-xs text-muted-foreground">{vehicle.owner.owner_code || "Owner code pending"} · {vehicle.owner.phone || "No mobile"}</p><Button asChild size="sm" variant="outline" className="mt-3"><Link href={`/super-admin/owners/${vehicle.owner.id}`}>Open owner review</Link></Button></div>
              <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Submitted through</p><p className="mt-1 font-medium">{vehicle.created_by_provider_name || "Vehicle owner self-registration"}</p><p className="mt-1 text-xs text-muted-foreground">Created {formatDate(vehicle.created_at)}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Vehicle documents</CardTitle><p className="text-sm text-muted-foreground">Approval validates active documents; correction returns them to pending; rejection revokes them.</p></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {vehicle.documents.length ? vehicle.documents.map((document) => {
                const href = documentHref(document.storage_key, document.file_name, document.document_type)
                return <article key={document.id} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><FileText className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{label(document.document_type)}</p><Badge variant="outline">{label(document.status)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{document.document_number || "No reference"} · Version {document.version}</p><p className="mt-1 text-xs text-muted-foreground">Expires: {formatDate(document.expires_at)}</p></div></div>{href ? <Button asChild size="sm" variant="outline" className="mt-3 w-full"><a href={href}><Download /> Download document</a></Button> : null}</article>
              }) : <div className="md:col-span-2 rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">No vehicle documents uploaded.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="size-5 text-emerald-700" /> QR verification credential</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">QR status</p><p className="mt-1 font-medium">{qr.is_active ? "Active" : "Inactive"}</p></div><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Issued at</p><p className="mt-1 font-medium">{formatDate(qr.issued_at)}</p></div><div className="md:col-span-2 rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Token reference</p><p className="mt-1 break-all font-mono text-xs">{qr.token || "Not issued"}</p></div></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5 text-emerald-700" /> Verification history</CardTitle></CardHeader>
            <CardContent className="space-y-3">{history.length ? history.map((event) => <article key={event.id} className="rounded-2xl border bg-slate-50 p-4"><p className="font-medium">{label(event.action)}</p><p className="mt-1 text-xs text-muted-foreground">{event.actor_name || "System"} · {formatDate(event.created_at)}</p>{event.reason ? <p className="mt-2 text-sm text-amber-800">{event.reason}</p> : null}</article>) : <p className="text-sm text-muted-foreground">No audit history available.</p>}</CardContent>
          </Card>
        </div>

        <Card className="sticky top-6 h-fit">
          <CardHeader><CardTitle>Police verification decision</CardTitle><p className="text-sm text-muted-foreground">Approve, request corrections, or reject the vehicle registration and active documents.</p></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="vehicle-review-notes">Review notes</Label><Textarea id="vehicle-review-notes" rows={8} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record identity checks, document findings, or required corrections." /></div>
            <div className="grid gap-2"><Button type="button" variant="outline" className={decision === "approve" ? "border-emerald-500 bg-emerald-50" : ""} onClick={() => setDecision("approve")}><CheckCircle2 /> Approve vehicle</Button><Button type="button" variant="outline" className={decision === "request_changes" ? "border-amber-500 bg-amber-50" : ""} onClick={() => setDecision("request_changes")}><FileEdit /> Request changes</Button><Button type="button" variant="outline" className={decision === "reject" ? "border-rose-500 bg-rose-50" : ""} onClick={() => setDecision("reject")}><XCircle /> Reject vehicle</Button>{decision ? <Button type="button" disabled={pending} onClick={() => void submitReview()} className="bg-emerald-800 text-white hover:bg-emerald-900">{pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Submit decision</Button> : null}</div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
