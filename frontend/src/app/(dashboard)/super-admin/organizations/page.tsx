import { Building2 } from "lucide-react"

import { OrganizationRegistryManager, type OrganizationItem, type TenantItem } from "@/components/super-admin/organization-registry-manager"
import { authenticatedBackendFetch } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export default async function OrganizationsPage() {
  const [tenants, organizations] = await Promise.all([
    authenticatedBackendFetch<TenantItem[]>("/iam/tenants"),
    authenticatedBackendFetch<OrganizationItem[]>("/admin/organizations"),
  ])

  return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1500px] space-y-6">
    <div><div className="flex items-center gap-2 text-emerald-700"><Building2 className="size-5" /><span className="text-sm font-semibold">Administration</span></div><h1 className="mt-2 text-3xl font-semibold">Organization Management</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Create and manage the full national organization hierarchy, including Bangladesh Police, BRTA, BRTC, government agencies, divisions, districts and child units.</p></div>
    <OrganizationRegistryManager tenants={tenants} initialItems={organizations} />
  </div></div>
}
