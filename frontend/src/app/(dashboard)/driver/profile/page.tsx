import { BadgeCheck, Clock3, Pencil, ShieldCheck } from "lucide-react"
import { redirect } from "next/navigation"

import { DriverApplicationForm } from "@/components/driver/driver-application-form"
import { Badge } from "@/components/ui/badge"
import { getDriverProfile } from "@/features/driver/data"

export const dynamic = "force-dynamic"

function label(value: string | null) {
  return value ? value.replaceAll("_", " ") : "No request"
}

export default async function DriverProfilePage() {
  const profile = await getDriverProfile()
  if (profile.verification_status !== "verified") {
    redirect("/driver/application")
  }

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-emerald-950 px-5 py-5 text-white shadow-lg sm:px-6 sm:py-6 lg:px-7">
          <div className="absolute -right-20 -top-24 size-64 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <Badge className="border-white/15 bg-white/10 text-[11px] text-emerald-100 hover:bg-white/10">
                <Pencil className="size-3.5" /> Verified profile maintenance
              </Badge>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300 sm:text-xs">
                {profile.driver_code}
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
                My Driver profile
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-emerald-100/75 sm:text-sm sm:leading-6">
                Request a correction without resetting your Police verification or vehicle-assignment eligibility.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:min-w-[360px]">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-emerald-100/65">Driver verification</p>
                  <BadgeCheck className="size-3.5 text-emerald-200" />
                </div>
                <p className="mt-1 text-sm font-semibold capitalize">
                  {label(profile.verification_status)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-emerald-100/65">Change request</p>
                  <Clock3 className="size-3.5 text-emerald-200" />
                </div>
                <p className="mt-1 text-sm font-semibold capitalize">
                  {label(profile.profile_change_status)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sky-700" />
          <div>
            <p className="font-semibold">Verification remains active</p>
            <p className="mt-1 text-xs leading-5 text-sky-800">
              Proposed values are not applied until Police approval. Your approved Driver record remains operational during review.
            </p>
          </div>
        </div>

        {profile.profile_change_review_notes ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Latest profile review note</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              {profile.profile_change_review_notes}
            </p>
          </div>
        ) : null}

        <DriverApplicationForm profile={profile} mode="profile-change" />
      </div>
    </div>
  )
}
