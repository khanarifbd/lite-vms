import Link from "next/link"
import { Award, CalendarClock, CarFront, CheckCircle2, CircleX, FileCheck2, Search, ShieldCheck, UserRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { serverEnv } from "@/config/server-env"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ certificateNumber: string }> }

type CertificateVerification = {
  valid: boolean
  certificate_number: string
  issued_at: string | null
  expires_at: string | null
  vts_installation_date: string | null
  owner_name: string
  registration_number: string
  vehicle_type: string
  chassis_number: string
}

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "long" })

function formatDate(value: string | null) {
  if (!value) return "Not recorded"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateFormatter.format(date)
}

async function getCertificate(certificateNumber: string) {
  try {
    const response = await fetch(
      `${serverEnv.apiBaseUrl}/public/qr/certificates/${encodeURIComponent(certificateNumber)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    )
    if (!response.ok) return null
    return (await response.json()) as CertificateVerification
  } catch {
    return null
  }
}

export default async function PublicCertificateVerificationPage({ params }: Props) {
  const { certificateNumber } = await params
  const certificate = await getCertificate(certificateNumber)

  if (!certificate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
        <Card className="w-full max-w-lg border-rose-200 text-center shadow-2xl">
          <CardHeader>
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <CircleX className="size-8" />
            </div>
            <CardTitle className="mt-4 text-2xl">Certificate not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm leading-6 text-muted-foreground">
              This certificate number is invalid or the certificate is no longer available for public verification.
            </p>
            <Button asChild variant="outline">
              <Link href="/verify/certificate"><Search className="size-4" /> Verify another certificate</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  const statusText = certificate.valid ? "Valid certificate" : "Expired certificate"

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8">
          <div className="absolute -right-20 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                <ShieldCheck className="size-3.5" /> Official certificate verification
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{statusText}</h1>
              <p className="mt-2 text-sm text-emerald-100/75">Certificate ID: {certificate.certificate_number}</p>
            </div>
            <Badge className={certificate.valid ? "bg-emerald-100 px-4 py-2 text-emerald-900" : "bg-rose-100 px-4 py-2 text-rose-900"}>
              {certificate.valid ? <CheckCircle2 className="size-4" /> : <CircleX className="size-4" />}
              {certificate.valid ? "Verified valid" : "Not currently valid"}
            </Badge>
          </div>
        </section>

        <Card id="certificate-details" className="scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileCheck2 className="size-5 text-emerald-700" /> Certificate details</CardTitle>
            <CardDescription>This information is read-only and was retrieved from the certificate ID or QR code.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Certificate ID", certificate.certificate_number, Award],
              ["Issued on", formatDate(certificate.issued_at), CalendarClock],
              ["Expires on", formatDate(certificate.expires_at), CalendarClock],
              ["VTS installation date", formatDate(certificate.vts_installation_date), CalendarClock],
            ].map(([label, value, Icon]) => {
              const DetailIcon = Icon as typeof Award
              return <div key={String(label)} className="rounded-2xl border bg-slate-50 p-4"><DetailIcon className="size-5 text-cyan-700" /><p className="mt-3 text-xs text-muted-foreground">{String(label)}</p><p className="mt-1 break-words font-semibold">{String(value)}</p></div>
            })}
          </CardContent>
        </Card>

        <Card id="vehicle-details" className="scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CarFront className="size-5 text-emerald-700" /> Vehicle details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {[
              ["Vehicle owner", certificate.owner_name, UserRound],
              ["Registration number", certificate.registration_number, CarFront],
              ["Vehicle type", certificate.vehicle_type || "Not recorded", CarFront],
              ["Chassis number", certificate.chassis_number || "Not recorded", FileCheck2],
            ].map(([label, value, Icon]) => {
              const DetailIcon = Icon as typeof UserRound
              return <div key={String(label)} className="rounded-2xl border bg-slate-50 p-4"><DetailIcon className="size-5 text-cyan-700" /><p className="mt-3 text-xs text-muted-foreground">{String(label)}</p><p className="mt-1 break-words font-semibold">{String(value)}</p></div>
            })}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button asChild><a href="#certificate-details"><FileCheck2 className="size-4" /> View certificate</a></Button>
          <Button asChild variant="outline"><a href="#vehicle-details"><CarFront className="size-4" /> Vehicle details</a></Button>
          <Button asChild variant="ghost"><Link href="/verify/certificate"><Search className="size-4" /> Verify another</Link></Button>
        </div>
      </div>
    </main>
  )
}
