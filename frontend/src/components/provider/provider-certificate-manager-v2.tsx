"use client"

import { Award, Download, Eye, FileText, Loader2, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DdMmYyyyInput, readOptionalDdMmYyyyIso } from "@/components/ui/date-input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Certificate = {
  certificate_number: string | null
  issued_at: string | null
  expires_at: string | null
  generated_at: string | null
  vts_installation_date: string | null
  status: "not_issued" | "active" | "expired"
  requirements: string[]
  can_generate: boolean
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" }).format(date)
}

function monthsAheadDate(months: number) {
  const today = new Date()
  const value = new Date(today.getFullYear(), today.getMonth() + months, today.getDate())
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function ProviderCertificateManagerV2({ vehicleId, canManage }: { vehicleId: string; canManage: boolean }) {
  const expiryFormRef = useRef<HTMLFormElement>(null)
  const [certificate, setCertificate] = useState<Certificate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function load() {
    const response = await fetch(`/api/provider/vehicles/${vehicleId}/certificate`)
    const data = (await response.json().catch(() => null)) as Certificate | { message?: string } | null
    if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Unable to load certificate status.")
    setCertificate(data as Certificate)
  }

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load certificate status."))
  }, [vehicleId])

  async function generate() {
    if (!expiryFormRef.current) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData(expiryFormRef.current)
      const certificateExpiresAt = readOptionalDdMmYyyyIso(form, "certificate_expires_at", "Certificate expiry date")
      if (!certificateExpiresAt) throw new Error("Certificate expiry date is required.")

      const response = await fetch("/api/provider/certificate-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicleId, certificate_expires_at: certificateExpiresAt }),
      })
      const data = (await response.json().catch(() => null)) as Certificate | { message?: string } | null
      if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Unable to generate certificate.")
      setCertificate(data as Certificate)
      setDialogOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate certificate.")
    } finally {
      setBusy(false)
    }
  }

  if (!certificate && !error) {
    return <Card><CardContent className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin text-emerald-800" /></CardContent></Card>
  }

  return <div className="space-y-5">
    {error ? <Alert variant="destructive"><AlertTitle>Certificate unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {certificate ? <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Award className="text-emerald-800" /> Vehicle certificate</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">Issue a certificate when the vehicle has at least one uploaded document. The VTS installation date is taken from the vehicle record.</p>
        </div>
        <Badge variant={certificate.status === "active" ? "secondary" : "outline"}>{certificate.status.replace("_", " ")}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {certificate.requirements.length ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><FileText /><AlertTitle>Vehicle document required</AlertTitle><AlertDescription>Upload at least one vehicle document before issuing a certificate.</AlertDescription></Alert> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Certificate no.</p><p className="mt-2 font-semibold">{certificate.certificate_number || "Not issued"}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Issued on</p><p className="mt-2 font-semibold">{formatDate(certificate.issued_at)}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Expires on</p><p className="mt-2 font-semibold">{formatDate(certificate.expires_at)}</p></div>
        </div>
        <div className="flex flex-wrap gap-3">
          {certificate.certificate_number ? <Button asChild variant="outline"><a href={`/api/provider/vehicles/${vehicleId}/certificate/download?view=1`} target="_blank" rel="noopener noreferrer"><Eye /> View certificate</a></Button> : null}
          {certificate.certificate_number ? <Button asChild variant="outline"><a href={`/api/provider/vehicles/${vehicleId}/certificate/download`}><Download /> Download certificate PDF</a></Button> : null}
          {canManage ? <Button disabled={!certificate.can_generate || busy} onClick={() => setDialogOpen(true)} className="bg-emerald-800 hover:bg-emerald-900"><RefreshCw />{certificate.certificate_number ? "Generate replacement certificate" : "Generate certificate"}</Button> : null}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set certificate expiry date</DialogTitle>
              <DialogDescription>VTS installation date is read automatically from the vehicle record and will be shown on the certificate.</DialogDescription>
            </DialogHeader>
            <form ref={expiryFormRef} onSubmit={(event) => { event.preventDefault(); void generate() }} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="certificate-expiry-date">Certificate expiry date</label>
                <DdMmYyyyInput id="certificate-expiry-date" name="certificate_expires_at" defaultValue={monthsAheadDate(1)} required />
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={busy} className="bg-emerald-800 hover:bg-emerald-900">{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}{certificate.certificate_number ? "Generate replacement" : "Generate certificate"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card> : null}
  </div>
}
