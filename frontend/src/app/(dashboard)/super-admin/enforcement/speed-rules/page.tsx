import { Gauge, ShieldCheck } from "lucide-react"

import { EnforcementModuleTabs } from "@/components/super-admin/enforcement-module-tabs"
import { SpeedRuleRegistryManager } from "@/components/super-admin/speed-rule-registry-manager"
import { Badge } from "@/components/ui/badge"
import type {
  EnforcementConfiguration,
  EnforcementGeofence,
  EnforcementJurisdiction,
  EnforcementPolicy,
  PoliceOrganization,
  SpeedRule,
  VehicleExemption,
} from "@/features/super-admin/enforcement"
import { authenticatedBackendFetch } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export default async function SpeedRulesPage() {
  const [policies, policeOrganizations, geofences, jurisdictions, speedRules] =
    await Promise.all([
      authenticatedBackendFetch<EnforcementPolicy[]>("/admin/enforcement/policies"),
      authenticatedBackendFetch<PoliceOrganization[]>("/admin/enforcement/police-organizations"),
      authenticatedBackendFetch<EnforcementGeofence[]>("/admin/enforcement/geofences"),
      authenticatedBackendFetch<EnforcementJurisdiction[]>("/admin/enforcement/jurisdictions"),
      authenticatedBackendFetch<SpeedRule[]>("/admin/enforcement/rules"),
    ])

  const data: EnforcementConfiguration = {
    policies,
    policeOrganizations,
    geofences,
    jurisdictions,
    speedRules,
    exemptions: [] as VehicleExemption[],
  }
  const active = speedRules.filter((item) => item.enabled).length
  const mapBased = speedRules.filter((item) => item.area_type !== "national").length

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-[1.75rem] bg-emerald-950 px-6 py-6 text-white shadow-lg sm:px-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                <Gauge className="size-3.5" /> Enforcement execution
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">Speed rules</h1>
              <p className="mt-2 text-sm leading-6 text-emerald-100/75">
                Combine one detection policy, one national or geofence area, vehicle scope,
                schedule, and the responsible police organization into an enforceable rule.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-[11px] text-emerald-100/60">Total rules</p>
                <p className="mt-1 text-2xl font-semibold">{speedRules.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-[11px] text-emerald-100/60">Active</p>
                <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold"><ShieldCheck className="size-4" />{active}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-[11px] text-emerald-100/60">Map-based</p>
                <p className="mt-1 text-2xl font-semibold">{mapBased}</p>
              </div>
            </div>
          </div>
        </section>

        <EnforcementModuleTabs />
        <SpeedRuleRegistryManager initialData={data} />
      </div>
    </div>
  )
}
