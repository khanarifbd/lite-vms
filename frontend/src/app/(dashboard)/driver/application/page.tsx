import { ClipboardCheck, IdCard, Pencil, ShieldCheck } from "lucide-react"
import Link from "next/link"

import { DriverApplicationForm } from "@/components/driver/driver-application-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getDriverProfile } from "@/features/driver/data"

export const dynamic = "force-dynamic"

export default async function DriverApplicationPage() {
  const profile = await getDriverProfile()

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-emerald-950 px-5 py-5 text-white shadow-lg sm:px-6 sm:py-6 lg:px-7">
          <div className="absolute -right-20 -top-24 size-64 rounded-full border border-white/10" />
          <div className="absolute -bottom-24 right-24 size-64 rounded-full bg-emerald-700/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <Badge className="border-white/15 bg-white/10 text-[11px] text-emerald-100 hover:bg-white/10">
                <ClipboardCheck className="size-3.5" /> Driver verification application
              </Badge>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300 sm:text-xs">
                {profile.driver_code}
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
                {profile.application_locked
                  ? "Verified national Driver application"
                  : "Complete your national Driver application"}
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-emerald-100/75 sm:text-sm sm:leading-6">
                {profile.application_locked
                  ? "The Police-approved first application and its documents are preserved as read-only evidence."
                  : "Add NID, personal, licence, employment, and document information for Bangladesh Police verification."}
              </p>
              {profile.verification_status === "verified" ? (
                <Button asChild size="sm" className="mt-4 bg-white text-emerald-950 hover:bg-emerald-50">
                  <Link href="/driver/profile"><Pencil /> Request profile change</Link>
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:min-w-[360px]">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3"><div className="flex items-center justify-between"><p className="text-[10px] text-emerald-100/65">NID identity</p><IdCard className="size-3.5 text-emerald-200" /></div><p className="mt-1 truncate text-sm font-semibold">{profile.nid_reference || "Not submitted yet"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3"><div className="flex items-center justify-between"><p className="text-[10px] text-emerald-100/65">Police status</p><ShieldCheck className="size-3.5 text-emerald-200" /></div><p className="mt-1 truncate text-sm font-semibold capitalize">{profile.verification_status.replaceAll("_", " ")}</p></div>
            </div>
          </div>
        </section>

        {profile.review_notes ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Police review note</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">{profile.review_notes}</p>
          </div>
        ) : null}

        <DriverApplicationForm profile={profile} />
      </div>
    </div>
  )
}
