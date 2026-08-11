"use client"

import { Award, Download, FileText, Loader2, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Certificate = {
  certificate_number: string | null
  issued_at: string | null
  expires_at: string | null
  generated_at: string | null
  status: "not_issued" | "active" | "expired"
  requirements: string[]
  can_generate: boolean
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" }).format(date)
}

export function VehicleCertificateManager({ vehicleId, canManage }: { vehicleId: string; canManage: boolean }) {
  const [certificate, setCertificate] = useState<Certificate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const response = await fetch(`/api/provider/vehicles/${vehicleId}/certificate`)
    const data = (await response.json().catch(() => null)) as Certificate | { message?: string } | null
    if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Unable to load certificate status.")
    setCertificate(data as Certificate)
  }

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load certificate status.")) }, [vehicleId])

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/provider/vehicles/${vehicleId}/certificate`, { method: "POST" })
      const data = (await response.json().catch(() => null)) as Certificate | { message?: string } | null
      if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Unable to generate certificate.")
      setCertificate(data as Certificate)
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
          {certificate.requirements.length ? <Alert className="border-amber-200 bg-amber-50 text-amber-950"><FileText /><AlertTitle>Documents required before certificate issue</AlertTitle><AlertDescription><p>Update these documents first: {certificate.requirements.join(", ")}.</p><Button asChild size="sm" variant="outline" className="mt-3"><Link href={`/provider/vehicles/${vehicleId}/documents`}>Open documents</Link></Button></AlertDescription></Alert> : null}
          <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Certificate no.</p><p className="mt-2 font-semibold">{certificate.certificate_number || "Not issued"}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Issued on</p><p className="mt-2 font-semibold">{formatDate(certificate.issued_at)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Expires on</p><p className="mt-2 font-semibold">{formatDate(certificate.expires_at)}</p></div></div>
          <div className="flex flex-wrap gap-3">
            {certificate.certificate_number ? <Button asChild variant="outline"><a href={`/api/provider/vehicles/${vehicleId}/certificate/download`}><Download /> Download certificate PDF</a></Button> : null}
            {canManage ? <Button disabled={!certificate.can_generate || busy} onClick={() => void generate()} className="bg-emerald-800 hover:bg-emerald-900">{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}{certificate.certificate_number ? "Generate replacement certificate" : "Generate certificate"}</Button> : null}
          </div>
        </CardContent>
      </Card> : null}
    </div>
  )
}
