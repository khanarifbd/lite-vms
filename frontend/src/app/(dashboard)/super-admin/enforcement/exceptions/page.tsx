import { Ban } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getEnforcementConfiguration } from "@/features/super-admin/enforcement"

export const dynamic = "force-dynamic"

export default async function ExceptionsPage() {
  const data = await getEnforcementConfiguration()
  return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1200px] space-y-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-emerald-700"><Ban className="size-5" /><span className="text-sm font-semibold">Traffic enforcement</span></div><h1 className="mt-2 text-3xl font-semibold">Vehicle Exceptions</h1><p className="mt-2 text-sm text-muted-foreground">Manage temporary exemptions for emergency, law-enforcement, testing, or specially permitted vehicles.</p></div><Button asChild><Link href="/super-admin/enforcement/policies">Open configuration editor</Link></Button></div><Card><CardHeader><CardTitle>Configured exceptions</CardTitle></CardHeader><CardContent className="space-y-3">{data.exemptions.length ? data.exemptions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"><div className="min-w-0"><p className="truncate font-semibold">{item.vehicle_id}</p><p className="mt-1 text-sm text-muted-foreground">{item.reason.replaceAll("_", " ")} · {item.violation_type ? item.violation_type.replaceAll("_", " ") : "All violations"}</p><p className="mt-1 text-xs text-muted-foreground">Valid from {new Date(item.valid_from).toLocaleString("en-BD")}{item.valid_to ? ` until ${new Date(item.valid_to).toLocaleString("en-BD")}` : ""}</p></div><Badge variant="outline" className={item.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-slate-500"}>{item.enabled ? "Active" : "Disabled"}</Badge></div>) : <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No vehicle exception configured yet.</div>}</CardContent></Card></div></div>
}
