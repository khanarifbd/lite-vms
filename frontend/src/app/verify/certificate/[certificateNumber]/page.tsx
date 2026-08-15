import Link from "next/link"
import {
  Award,
  Building2,
  CalendarClock,
  CarFront,
  CheckCircle2,
  CircleX,
  FileCheck2,
  RadioTower,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react"

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
  registration_date: string | null
  registration_authority: string | null
  vehicle_type: string
  vehicle_category: string | null
  brand: string | null
  model: string | null
  color: string | null
  manufacturing_year: number | null
  chassis_number: string
  engine_number: string | null
  vehicle_verification_status: string
  vehicle_status: string
  provider_name: string
  provider_code: string | null
  btrc_license_number: string | null
  provider_status: string | null
  gps_online: boolean
  last_signal_at: string | null
}

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "long" })
const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Dhaka",
})

function formatDate(value: string | null) {
  if (!value) return "Not recorded"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateFormatter.format(date)
}

function formatDateTime(value: string | null) {
  if (!value) return "No recent signal recorded"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "No recent signal recorded" : dateTimeFormatter.format(date)
}

function titleCase(value: string | null | undefined) {
  if (!value) return "Not recorded"
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
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

function DetailCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Award
}) {
  return (
    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-white to-cyan-50/40 p-4 shadow-sm">
      <div className="flex size-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
        <Icon className="size-4.5" />
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-950">{value}</p>
    </div>
  )
}

export default async function PublicCertificateVerificationPage({ params }: Props) {
  const { certificateNumber } = await params
  const certificate = await getCertificate(certificateNumber)

  if (!certificate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfeff_0,_#f8fafc_42%,_#e2e8f0_100%)] px-4 py-10">
        <Card className="w-full max-w-lg border-rose-200 text-center shadow-2xl">
          <CardHeader>
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <CircleX className="size-8" />
            </div>
            <CardTitle className="mt-4 text-2xl">Certificate not found</CardTitle>
            <CardDescription>Public certificate verification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm leading-6 text-muted-foreground">
              This certificate number is invalid, unavailable, or no longer exists in the public certificate registry.
            </p>
            <Button asChild variant="outline">
              <Link href="/verify/certificate"><Search className="size-4" /> Verify another certificate</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  const vehicleVerified = certificate.vehicle_verification_status.toLowerCase() === "verified"
  const providerApproved = ["approved", "active"].includes((certificate.provider_status || "").toLowerCase())

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0,_#f8fafc_42%,_#e2e8f0_100%)] px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-cyan-950 via-teal-900 to-emerald-950 px-6 py-7 text-white shadow-2xl sm:px-8 sm:py-9">
          <div className="absolute -right-20 -top-24 size-80 rounded-full border border-white/10" />
          <div className="absolute right-28 top-8 size-36 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <Badge className="border-white/15 bg-white/10 text-cyan-50 hover:bg-white/10">
                <ShieldCheck className="size-3.5" /> Public certificate verification
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {certificate.valid ? "Certificate verified" : "Certificate expired"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-cyan-50/75">
                Certificate record retrieved directly from AutoGeneration LTD CMS Portal for public and regulatory inspection.
              </p>
              <p className="mt-3 font-mono text-xs text-cyan-100/85 sm:text-sm">
                Certificate ID: {certificate.certificate_number}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <Badge className={certificate.valid ? "bg-emerald-100 px-4 py-2 text-emerald-900" : "bg-rose-100 px-4 py-2 text-rose-900"}>
                {certificate.valid ? <CheckCircle2 className="size-4" /> : <CircleX className="size-4" />}
                {certificate.valid ? "Currently valid" : "Not currently valid"}
              </Badge>
              <span className="text-xs text-cyan-50/60">Read-only public record</span>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-2xl border p-4 shadow-sm ${certificate.valid ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              {certificate.valid ? <CheckCircle2 className="size-5 text-emerald-700" /> : <CircleX className="size-5 text-rose-700" />}
              Certificate status
            </div>
            <p className="mt-2 text-sm text-slate-600">{certificate.valid ? "Valid within issued period" : "Expired or outside validity period"}</p>
          </div>
          <div className={`rounded-2xl border p-4 shadow-sm ${vehicleVerified ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="size-5 text-emerald-700" /> Vehicle verification
            </div>
            <p className="mt-2 text-sm text-slate-600">{titleCase(certificate.vehicle_verification_status)}</p>
          </div>
          <div className={`rounded-2xl border p-4 shadow-sm ${providerApproved ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Building2 className="size-5 text-emerald-700" /> VTS provider
            </div>
            <p className="mt-2 truncate text-sm text-slate-600">{certificate.provider_name}</p>
          </div>
          <div className={`rounded-2xl border p-4 shadow-sm ${certificate.gps_online ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <RadioTower className={`size-5 ${certificate.gps_online ? "text-emerald-700" : "text-slate-500"}`} /> GPS connection
            </div>
            <p className="mt-2 text-sm text-slate-600">{certificate.gps_online ? "Connected / recent signal" : "No recent signal"}</p>
          </div>
        </section>

        <Card id="certificate-details" className="scroll-mt-6 border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-white/70">
            <CardTitle className="flex items-center gap-2"><FileCheck2 className="size-5 text-cyan-700" /> Certificate information</CardTitle>
            <CardDescription>Core validity information associated with this certificate number.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <DetailCard label="Certificate ID" value={certificate.certificate_number} icon={Award} />
            <DetailCard label="Issued on" value={formatDate(certificate.issued_at)} icon={CalendarClock} />
            <DetailCard label="Valid until" value={formatDate(certificate.expires_at)} icon={CalendarClock} />
            <DetailCard label="VTS installation date" value={formatDate(certificate.vts_installation_date)} icon={CalendarClock} />
          </CardContent>
        </Card>

        <Card id="vehicle-details" className="scroll-mt-6 border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-white/70">
            <CardTitle className="flex items-center gap-2"><CarFront className="size-5 text-cyan-700" /> Vehicle identity</CardTitle>
            <CardDescription>Vehicle particulars linked to the verified certificate record.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
            <DetailCard label="Vehicle owner" value={certificate.owner_name} icon={UserRound} />
            <DetailCard label="Registration number" value={certificate.registration_number} icon={CarFront} />
            <DetailCard label="Vehicle type" value={certificate.vehicle_type || "Not recorded"} icon={CarFront} />
            <DetailCard label="Engine number" value={certificate.engine_number || "Not recorded"} icon={FileCheck2} />
            <DetailCard label="Chassis number" value={certificate.chassis_number || "Not recorded"} icon={FileCheck2} />
            <DetailCard label="Registration authority" value={certificate.registration_authority || "Not recorded"} icon={Building2} />
            <DetailCard label="Registration date" value={formatDate(certificate.registration_date)} icon={CalendarClock} />
            <DetailCard label="Brand / model" value={[certificate.brand, certificate.model].filter(Boolean).join(" / ") || "Not recorded"} icon={CarFront} />
            <DetailCard label="Color / year" value={[certificate.color, certificate.manufacturing_year].filter(Boolean).join(" / ") || "Not recorded"} icon={CarFront} />
          </CardContent>
        </Card>

        <Card id="provider-details" className="scroll-mt-6 border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-white/70">
            <CardTitle className="flex items-center gap-2"><Building2 className="size-5 text-cyan-700" /> VTS provider & compliance</CardTitle>
            <CardDescription>Provider information available in the CMS record for regulatory verification.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <DetailCard label="VTS provider" value={certificate.provider_name} icon={Building2} />
            <DetailCard label="Provider code" value={certificate.provider_code || "Not recorded"} icon={ShieldCheck} />
            <DetailCard label="BTRC VTS licence" value={certificate.btrc_license_number || "Not recorded"} icon={Award} />
            <DetailCard label="Provider status" value={titleCase(certificate.provider_status)} icon={CheckCircle2} />
          </CardContent>
          <CardContent className="pt-0">
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm leading-6 text-slate-700">
              <strong className="text-slate-950">Compliance note:</strong> This page verifies the certificate record stored in AutoGeneration LTD CMS Portal. Certificate validity is based on the recorded issue and expiry period. Other statutory vehicle documents should be checked separately where required by the inspecting authority.
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-white/70">
            <CardTitle className="flex items-center gap-2"><RadioTower className="size-5 text-cyan-700" /> Operational status</CardTitle>
            <CardDescription>Current public operational indicators available for this vehicle record.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <DetailCard label="Vehicle status" value={titleCase(certificate.vehicle_status)} icon={CarFront} />
            <DetailCard label="Verification status" value={titleCase(certificate.vehicle_verification_status)} icon={ShieldCheck} />
            <DetailCard label="GPS status" value={certificate.gps_online ? "Connected" : "No recent signal"} icon={RadioTower} />
            <DetailCard label="Last GPS signal" value={formatDateTime(certificate.last_signal_at)} icon={CalendarClock} />
          </CardContent>
        </Card>

        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-slate-950">Need to verify another certificate?</p>
            <p className="mt-1 text-xs text-slate-500">Search by the certificate number printed on the certificate or scan its QR code.</p>
          </div>
          <Button asChild className="bg-cyan-800 hover:bg-cyan-900">
            <Link href="/verify/certificate"><Search className="size-4" /> Verify another certificate</Link>
          </Button>
        </div>

        <p className="pb-3 text-center text-xs leading-5 text-slate-500">
          Public verification is read-only. No login is required and no private owner contact, location, or driver information is displayed.
        </p>
      </div>
    </main>
  )
}
