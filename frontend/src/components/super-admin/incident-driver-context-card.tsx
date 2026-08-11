"use client"

import { ExternalLink, Loader2, UserRoundCheck } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ReviewDriverContext } from "@/features/super-admin/violation-review-types"

function label(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "—"
}

export function IncidentDriverContextCard({ candidateId }: { candidateId: string }) {
  const [driver, setDriver] = useState<ReviewDriverContext | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadDriver() {
      try {
        const response = await fetch(
          `/api/super-admin/enforcement/review-queue/${encodeURIComponent(candidateId)}/driver`,
          { signal: controller.signal }
        )
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || "Unable to load incident driver.")
        setDriver(payload as ReviewDriverContext | null)
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : "Unable to load incident driver.")
      }
    }

    void loadDriver()
    return () => controller.abort()
  }, [candidateId])

  if (error) {
    return (
      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Driver context could not be loaded: {error}
      </div>
    )
  }

  if (driver === undefined) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl border bg-white p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-emerald-700" />
        Resolving the driver assigned at the incident time…
      </div>
    )
  }

  if (driver === null) {
    return (
      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
        <div className="flex items-start gap-3">
          <UserRoundCheck className="mt-0.5 size-5 text-amber-700" />
          <div>
            <p className="text-sm font-semibold">No driver assigned at incident time</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No candidate driver, duty session, or assignment history matched the vehicle at the detection timestamp.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <UserRoundCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Incident driver</p>
            <p className="mt-1 font-semibold">{driver.full_name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {driver.driver_code} · {driver.phone} · {driver.district}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{label(driver.verification_status)}</Badge>
          <Badge variant="outline">{driver.was_on_duty ? "On duty at incident" : "Assigned at incident"}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Driving licence</p>
          <p className="mt-1 text-sm font-semibold">{driver.licence_number || "Not available"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label(driver.licence_type)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Licence status</p>
          <p className="mt-1 text-sm font-semibold capitalize">{label(driver.licence_status)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Expiry: {driver.licence_expiry_date || "—"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Behaviour score</p>
          <p className="mt-1 text-sm font-semibold">{driver.behaviour_score}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Account {label(driver.account_status)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Resolved from</p>
          <p className="mt-1 text-sm font-semibold capitalize">{label(driver.resolution_source)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Incident-time historical match</p>
        </div>
      </div>

      <Button asChild size="sm" variant="outline" className="mt-4 w-full sm:w-auto">
        <Link href={`/super-admin/drivers/${driver.id}`}>
          View driver profile <ExternalLink />
        </Link>
      </Button>
    </div>
  )
}
