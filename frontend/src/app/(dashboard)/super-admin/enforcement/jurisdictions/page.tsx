import { Building2 } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getEnforcementConfiguration } from "@/features/super-admin/enforcement"

export const dynamic = "force-dynamic"

export default async function JurisdictionsPage() {
  const data = await getEnforcementConfiguration()
  return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1200px] space-y-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-emerald-700"><Building2 className="size-5" /><span className="text-sm font-semibold">Traffic enforcement</span></div><h1 className="mt-2 text-3xl font-semibold">Police Jurisdictions</h1><p className="mt-2 text-sm text-muted-foreground">Police authorities responsible for reviewing violations detected inside their assigned areas.</p></div><Button asChild><Link href="/super-admin/enforcement/policies">Open configuration editor</Link></Button></div><Card><CardHeader><CardTitle>Configured jurisdictions</CardTitle></CardHeader><CardContent className="space-y-3">{data.jurisdictions.length ? data.jurisdictions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"><div><p className="font-semibold">{item.name}</p><p className="mt-1 text-sm text-muted-foreground">Organization #{item.organization_id} · {item.area_type.replaceAll("_", " ")} · Priority {item.priority}</p></div><Badge variant="outline" className={item.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-slate-500"}>{item.enabled ? "Active" : "Disabled"}</Badge></div>) : <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No police jurisdiction configured yet.</div>}</CardContent></Card></div></div>
}
