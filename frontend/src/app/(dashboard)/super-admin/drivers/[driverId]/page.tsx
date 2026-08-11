import { ArrowLeft, CarFront, FileText, Gauge, History, Network, UserRound } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { DriverAdminManager } from "@/components/super-admin/driver-admin-manager"
import { TemporaryPasswordResetCard } from "@/components/super-admin/temporary-password-reset-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminDriverDetail, type AdminDriverDetail } from "@/features/super-admin/drivers"
import { BackendApiError } from "@/lib/api/server"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ driverId: string }> }
const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })
function formatDate(value: string | null) { if (!value) return "Not available"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date) }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()) }
function documentHref(storageKey: string, fileName: string | null, documentType: string) { const params = new URLSearchParams({ storageKey, fileName: fileName || `${documentType}.pdf`, download: "1" }); return `/api/documents?${params.toString()}` }

export default async function SuperAdminDriverDetailPage({ params }: Props) {
  const { driverId } = await params
  let detail: AdminDriverDetail
  try { detail = await getAdminDriverDetail(driverId) } catch (error) { if (error instanceof BackendApiError && error.status === 404) notFound(); throw error }
  const { driver } = detail

  const profileRows = [
    ["Driver code", driver.driver_code], ["Mobile", driver.mobile], ["Email", driver.email || "Not provided"],
    ["NID reference", driver.nid_reference || "Not provided"], ["Date of birth", formatDate(driver.date_of_birth)],
    ["Father's name", driver.father_name || "Not provided"], ["Mother's name", driver.mother_name || "Not provided"],
    ["Gender", driver.gender || "Not provided"], ["Blood group", driver.blood_group || "Not provided"],
    ["District", driver.district], ["Employment type", driver.employment_type ? label(driver.employment_type) : "Not provided"],
    ["Medical fitness expiry", formatDate(driver.medical_fitness_expiry_date)],
  ]

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1500px] space-y-6">
      <Button asChild variant="ghost" className="-ml-3"><Link href="/super-admin/drivers"><ArrowLeft /> Back to drivers</Link></Button>
      <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10"><div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" /><div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">National driver record</Badge><h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">{driver.full_name}</h1><p className="mt-2 text-emerald-100/70">{driver.driver_code} · {driver.mobile}</p></div><div className="flex flex-wrap items-center gap-3"><Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50"><Link href={`/super-admin/drivers/duty-history?driver_id=${driver.id}`}><History /> Duty history</Link></Button><StatusBadge status={driver.verification_status} /></div></div></section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Account", label(detail.account_status)], ["Verification", label(driver.verification_status)], ["Licence", label(driver.licence.verification_status)],
          ["Behaviour score", `${Math.round(driver.behaviour_score)}%`], ["Documents", driver.documents.length],
          ["Active vehicle", driver.current_vehicle_registration || "Not assigned"],
        ].map(([title, value]) => <Card key={String(title)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-3 truncate text-xl font-semibold">{value}</p></CardContent></Card>)}
      </section>

      <DriverAdminManager detail={detail} />
      <TemporaryPasswordResetCard entityType="driver" entityId={driver.id} accountName={driver.full_name} />

      <section className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="size-5 text-emerald-700" /> Driver profile</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{profileRows.map(([key, value]) => <div key={String(key)} className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-1 break-words font-medium">{value}</p></div>)}<div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Present address</p><p className="mt-1 whitespace-pre-wrap font-medium">{driver.present_address || "Not provided"}</p></div><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Permanent address</p><p className="mt-1 whitespace-pre-wrap font-medium">{driver.permanent_address || "Not provided"}</p></div></CardContent></Card>
          <Card><CardHeader><CardTitle>Submitted documents</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{driver.documents.length ? driver.documents.map((document) => <article key={document.id} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><FileText className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{label(document.document_type)}</p><StatusBadge status={document.status} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{document.file_name || document.document_reference || "Stored document"}</p>{document.storage_key ? <Button asChild variant="outline" size="sm" className="mt-3"><a href={documentHref(document.storage_key, document.file_name, document.document_type)} data-document-view-enhanced="false"><FileText /> Document</a></Button> : null}</div></div></article>) : <p className="text-sm text-muted-foreground">No documents submitted.</p>}</CardContent></Card>
        </div>

        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Driving licence</CardTitle></CardHeader><CardContent className="space-y-3">{[["Number", driver.licence.licence_number], ["Type", label(driver.licence.licence_type)], ["Vehicle classes", driver.licence.vehicle_classes.join(", ") || "Not provided"], ["Issue date", formatDate(driver.licence.issue_date)], ["Expiry date", formatDate(driver.licence.expiry_date)], ["Authority", driver.licence.issuing_authority]].map(([key, value]) => <div key={String(key)} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-1 font-medium">{value}</p></div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Current assignment</CardTitle></CardHeader><CardContent className="space-y-3">{driver.current_vehicle_registration ? <><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><CarFront className="size-5 text-emerald-700" /><div><p className="text-xs text-muted-foreground">Vehicle</p><p className="font-medium">{driver.current_vehicle_registration}</p></div></div><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><UserRound className="size-5 text-emerald-700" /><div><p className="text-xs text-muted-foreground">Owner</p><p className="font-medium">{driver.current_owner_name || "Not available"}</p></div></div><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><Network className="size-5 text-emerald-700" /><div><p className="text-xs text-muted-foreground">VTS provider</p><p className="font-medium">{driver.current_provider_name || "Not available"}</p></div></div></> : <p className="text-sm text-muted-foreground">No active vehicle assignment.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Organization links</CardTitle></CardHeader><CardContent className="space-y-3">{driver.links.length ? driver.links.map((link) => <div key={link.link_id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-medium">{link.organization_name}</p><p className="text-xs text-muted-foreground">{label(link.organization_type)}</p></div><StatusBadge status={link.status} /></div>) : <p className="text-sm text-muted-foreground">No owner or provider links.</p>}</CardContent></Card>
          {["pending", "under_review", "changes_requested"].includes(driver.verification_status) ? <Button asChild className="w-full bg-emerald-800 text-white hover:bg-emerald-900"><Link href="/super-admin/approvals?entity=driver">Open driver review queue</Link></Button> : null}
        </div>
      </section>
    </div></div>
  )
}
