"use client"

import { Award, Download, Eye, FileText, Loader2, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

function monthsAgoDate(months: number) {
  const today = new Date()
  const value = new Date(today.getFullYear(), today.getMonth() - months, today.getDate())
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function monthsAheadDate(months: number) {
  const today = new Date()
  const value = new Date(today.getFullYear(), today.getMonth() + months, today.getDate())
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function todayDate() {
  return monthsAgoDate(0)
}

export function VehicleCertificateManager({ vehicleId, canManage, apiBasePath = "/api/provider/vehicles", documentsHref }: { vehicleId: string; canManage: boolean; apiBasePath?: string; documentsHref?: string }) {
  const [certificate, setCertificate] = useState<Certificate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [installationDialogOpen, setInstallationDialogOpen] = useState(false)
  const [installationDate, setInstallationDate] = useState(monthsAgoDate(1))
  const [certificateExpiryDate, setCertificateExpiryDate] = useState(monthsAheadDate(1))

  async function load() {
    const response = await fetch(`${apiBasePath}/${vehicleId}/certificate`)
    const data = (await response.json().catch(() => null)) as Certificate | { message?: string } | null
    if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Unable to load certificate status.")
    setCertificate(data as Certificate)
  }

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load certificate status.")) }, [apiBasePath, vehicleId])

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`${apiBasePath}/${vehicleId}/certificate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vts_installation_date: installationDate, certificate_expires_at: certificateExpiryDate }),
      })
      const data = (await response.json().catch(() => null)) as Certificate | { message?: string } | null
      if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Unable to generate certificate.")
      setCertificate(data as Certificate)
      setInstallationDialogOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate certificate.")
    } finally {
      setBusy(false)
    }
  }

  if (!certificate && !error) return <Card><CardContent className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin text-emerald-800" /></CardContent></Card>

  return (
    <div className="space-y-5">
      {error ? <Alert variant="destructive"><AlertTitle>Certificate unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {certificate ? <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div><CardTitle className="flex items-center gap-2"><Award className="text-emerald-800" /> Vehicle certificate</CardTitle><p className="mt-2 text-sm text-muted-foreground">Issue a certificate after all required documents are current. A new certificate can be issued after expiry.</p></div>
          <Badge variant={certificate.status === "active" ? "secondary" : "outline"}>{certificate.status.replace("_", " ")}</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          {certificate.requirements.length ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><FileText /><AlertTitle>Documents required before certificate issue</AlertTitle><AlertDescription><p>Update these documents first: {certificate.requirements.join(", ")}.</p>{documentsHref ? <Button asChild size="sm" variant="outline" className="mt-3"><Link href={documentsHref}>Open documents</Link></Button> : null}</AlertDescription></Alert> : null}
          <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Certificate no.</p><p className="mt-2 font-semibold">{certificate.certificate_number || "Not issued"}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Issued on</p><p className="mt-2 font-semibold">{formatDate(certificate.issued_at)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Expires on</p><p className="mt-2 font-semibold">{formatDate(certificate.expires_at)}</p></div></div>
          <div className="flex flex-wrap gap-3">
            {certificate.certificate_number ? <Button asChild variant="outline"><a href={`${apiBasePath}/${vehicleId}/certificate/download?view=1`} target="_blank" rel="noopener noreferrer"><Eye /> View certificate</a></Button> : null}
            {certificate.certificate_number ? <Button asChild variant="outline"><a href={`${apiBasePath}/${vehicleId}/certificate/download`}><Download /> Download certificate PDF</a></Button> : null}
            {canManage ? <Button disabled={!certificate.can_generate || busy} onClick={() => setInstallationDialogOpen(true)} className="bg-emerald-800 hover:bg-emerald-900"><RefreshCw />{certificate.certificate_number ? "Generate replacement certificate" : "Generate certificate"}</Button> : null}
          </div>
          <Dialog open={installationDialogOpen} onOpenChange={setInstallationDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set certificate dates</DialogTitle>
                <DialogDescription>Both dates are saved to the vehicle record and shown on the certificate.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <label className="block text-sm font-medium" htmlFor="vts-installation-date">VTS installation date</label>
                <input id="vts-installation-date" type="date" max={todayDate()} value={installationDate} onChange={(event) => setInstallationDate(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none" />
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Set automatically from today</p>
                  <div className="flex flex-wrap gap-2">{[1, 2, 3].map((months) => <Button key={months} type="button" size="sm" variant={installationDate === monthsAgoDate(months) ? "default" : "outline"} onClick={() => setInstallationDate(monthsAgoDate(months))}>{months} month{months > 1 ? "s" : ""} ago</Button>)}</div>
                </div>
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium" htmlFor="certificate-expiry-date">Certificate expiry date</label>
                  <input id="certificate-expiry-date" type="date" min={monthsAheadDate(0)} value={certificateExpiryDate} onChange={(event) => setCertificateExpiryDate(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none" />
                  <p className="mb-2 mt-3 text-xs text-muted-foreground">Set automatically from today</p>
                  <div className="flex flex-wrap gap-2">{[1, 3, 6, 12].map((months) => <Button key={months} type="button" size="sm" variant={certificateExpiryDate === monthsAheadDate(months) ? "default" : "outline"} onClick={() => setCertificateExpiryDate(monthsAheadDate(months))}>{months} month{months > 1 ? "s" : ""}</Button>)}</div>
                </div>
              </div>
              <DialogFooter showCloseButton>
                <Button type="button" disabled={busy || !installationDate || !certificateExpiryDate} onClick={() => void generate()} className="bg-emerald-800 hover:bg-emerald-900">{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}{certificate.certificate_number ? "Generate replacement" : "Generate certificate"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card> : null}
    </div>
  )
}
