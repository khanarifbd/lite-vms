import { Scale, ShieldCheck } from "lucide-react"

import { EnforcementModuleTabs } from "@/components/super-admin/enforcement-module-tabs"
import { ViolationPolicyManager } from "@/components/super-admin/violation-policy-manager"
import { Badge } from "@/components/ui/badge"
import type { EnforcementPolicy } from "@/features/super-admin/enforcement"
import { authenticatedBackendFetch } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export default async function PoliciesPage() {
  const policies = await authenticatedBackendFetch<EnforcementPolicy[]>(
    "/admin/enforcement/policies"
  )
  const active = policies.filter((item) => item.enabled).length

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-[1.75rem] bg-emerald-950 px-6 py-6 text-white shadow-lg sm:px-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                <Scale className="size-3.5" /> Detection configuration
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">Violation policies</h1>
              <p className="mt-2 text-sm leading-6 text-emerald-100/75">
                Define reusable overspeed detection duration, packet confirmation, cooldown,
                severity, legal reference, and review behaviour before connecting them to rules.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-[11px] text-emerald-100/60">Total policies</p>
                <p className="mt-1 text-2xl font-semibold">{policies.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-[11px] text-emerald-100/60">Active</p>
                <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold"><ShieldCheck className="size-4" />{active}</p>
              </div>
            </div>
          </div>
        </section>

        <EnforcementModuleTabs />
        <ViolationPolicyManager initialItems={policies} />
      </div>
    </div>
  )
}
