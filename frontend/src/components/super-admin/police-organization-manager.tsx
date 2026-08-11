"use client"

import { Building2, Plus } from "lucide-react"
import { FormEvent, useMemo, useState } from "react"

import { flattenOrganizationTree, OrganizationTreeSelect } from "@/components/super-admin/organization-tree-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Tenant = {
  public_id: string
  code: string
  name: string
  tenant_type: string
  status: string
}

type Organization = {
  public_id: string
  tenant_public_id: string
  parent_public_id: string | null
  organization_type: string
  code: string
  name_en: string
  name_bn: string | null
  registration_number: string | null
  status: string
}

export function PoliceOrganizationManager({
  initialTenants,
  initialOrganizations,
}: {
  initialTenants: Tenant[]
  initialOrganizations: Organization[]
}) {
  const platformTenant = useMemo(
    () => initialTenants.find((item) => item.name.trim().toLowerCase() === "national vehicle platform")
      ?? initialTenants.find((item) => item.code.trim().toLowerCase().includes("national")),
    [initialTenants],
  )
  const [organizations, setOrganizations] = useState(initialOrganizations)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const policeOrganizations = useMemo(
    () => organizations.filter((item) =>
      item.tenant_public_id === platformTenant?.public_id
      && ["bangladesh_police", "police_unit"].includes(item.organization_type),
    ),
    [organizations, platformTenant?.public_id],
  )
  const policeTree = useMemo(() => flattenOrganizationTree(policeOrganizations), [policeOrganizations])
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visiblePoliceTree = normalizedSearch ? policeTree.filter((item) => `${item.name_bn || ""} ${item.name_en} ${item.code}`.toLocaleLowerCase().includes(normalizedSearch)) : policeTree

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!platformTenant) {
      setMessage("National Vehicle Platform tenant পাওয়া যায়নি। আগে platform tenant তৈরি বা ঠিক করুন।")
      return
    }

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch("/api/super-admin/police-organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_public_id: platformTenant.public_id,
          parent_public_id: form.get("parent_public_id") || null,
          organization_type: "bangladesh_police",
          code: String(form.get("code") || "").trim().toUpperCase(),
          name_en: String(form.get("name_en") || "").trim(),
          name_bn: String(form.get("name_bn") || "").trim() || null,
          registration_number: String(form.get("registration_number") || "").trim() || null,
          status: "active",
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || "Unable to create police organization.")
      setOrganizations((current) => [...current, payload])
      formElement.reset()
      setMessage("Police organization created successfully.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create police organization.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.4fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="size-5" /> Add police organization</CardTitle>
          <p className="text-sm text-muted-foreground">Bangladesh Police is the root. Build Range/Division → District → Upazila/Thana units under it.</p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <label className="grid gap-2 text-sm font-medium">Parent organization (optional)
              <OrganizationTreeSelect name="parent_public_id" items={policeOrganizations} rootLabel="No parent — Bangladesh Police root" help="Bangladesh Police root তৈরি করতে parent খালি রাখুন। অন্য সব unit-এর জন্য parent নির্বাচন করুন।" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">Organization code<Input name="code" required placeholder="DMP-MIRPUR" /></label>
              <label className="grid gap-2 text-sm font-medium">Registration number (optional)<Input name="registration_number" /></label>
            </div>
            <label className="grid gap-2 text-sm font-medium">English name<Input name="name_en" required placeholder="Mirpur Police Division" /></label>
            <label className="grid gap-2 text-sm font-medium">Bangla name (optional)<Input name="name_bn" placeholder="মিরপুর পুলিশ বিভাগ" /></label>
            {message ? <p className={message.includes("successfully") ? "text-sm text-emerald-700" : "text-sm text-rose-700"}>{message}</p> : null}
            <Button disabled={busy || !platformTenant} className="bg-emerald-800 hover:bg-emerald-900">{busy ? "Creating…" : "Create organization"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Police hierarchy</CardTitle>
          <p className="text-sm text-muted-foreground">Bangladesh Police এবং এর Range/Division, District ও Upazila/Thana units grouped hierarchy হিসেবে দেখানো হচ্ছে।</p>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search police organization name or code" />
        </CardHeader>
        <CardContent className="space-y-2">
          {visiblePoliceTree.length ? visiblePoliceTree.map((item) => {
            const parent = policeOrganizations.find((candidate) => candidate.public_id === item.parent_public_id)
            return <div key={item.public_id} className="rounded-2xl border p-4" style={{ marginLeft: normalizedSearch ? 0 : `${Math.min(item.depth, 4) * 22}px` }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 className="size-5" /></div>
                  <div><p className="font-semibold">{item.depth ? "└─ " : ""}{item.name_bn || item.name_en}</p><p className="text-sm text-muted-foreground">{item.name_en} · {item.code}</p>{parent ? <p className="mt-1 text-xs text-muted-foreground">Under: {parent.name_bn || parent.name_en}</p> : <p className="mt-1 text-xs text-emerald-700">Root police organization</p>}</div>
                </div>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{item.status}</Badge>
              </div>
            </div>
          }) : <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No matching police organizations found.</div>}
        </CardContent>
      </Card>
    </div>
  )
}
