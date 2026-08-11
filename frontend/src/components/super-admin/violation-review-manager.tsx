"use client"

import {
  Building2,
  CarFront,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  MapPinned,
  RadioTower,
  UserRound,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { IncidentDriverContextCard } from "@/components/super-admin/incident-driver-context-card"
import { IncidentTripHistoryDialog } from "@/components/super-admin/incident-trip-history-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ViolationReviewCandidate } from "@/features/super-admin/violation-review-types"

function evidenceValue(item: ViolationReviewCandidate, key: string) {
  const value = item.evidence?.[key]
  return typeof value === "string" || typeof value === "number" ? value : null
}

function label(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "—"
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—"
}

function vehicleName(item: ViolationReviewCandidate) {
  const vehicle = item.vehicle_profile
  return vehicle?.registration_number_display || vehicle?.registration_number || item.vehicle_id
}

export function ViolationReviewManager({ items }: { items: ViolationReviewCandidate[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function toggleDetails(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function decide(id: string, decision: "approve" | "reject") {
    const reviewNote = (notes[id] || "").trim()
    if (reviewNote.length < 3) {
      setError("Enter a review note of at least three characters before approving or rejecting.")
      return
    }
    setPendingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/super-admin/enforcement/review-queue/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, review_note: reviewNote }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || "Unable to review candidate.")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review candidate.")
    } finally {
      setPendingId(null)
    }
  }

  if (!items.length) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          There are no pending violation candidates in the national review queue.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {items.map((item) => {
        const ruleName = evidenceValue(item, "rule_name")
        const policyName = evidenceValue(item, "policy_name")
        const packetCount = evidenceValue(item, "consecutive_packets")
        const duration = evidenceValue(item, "duration_seconds")
        const vehicle = item.vehicle_profile
        const owner = item.owner_profile
        const provider = item.provider_profile
        const device = item.device_profile
        const expanded = expandedIds.has(item.id)

        return (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <MapPinned className="size-4 text-emerald-700" />
                      <p className="font-semibold capitalize">
                        {item.violation_type.replaceAll("_", " ")}
                      </p>
                      <span className="text-muted-foreground">·</span>
                      <p className="font-semibold">{vehicleName(item)}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Detected: {dateTime(item.detected_at)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Responsible organization: {item.responsible_organization_name || item.review_organization_id || "Not assigned"}
                    </p>
                  </div>
                  <Badge variant="outline">{label(item.status)}</Badge>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Detected speed</p>
                    <p className="mt-1 font-semibold">{item.detected_value ?? "—"} km/h</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Allowed threshold</p>
                    <p className="mt-1 font-semibold">{item.allowed_value ?? "—"} km/h</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Consecutive evidence</p>
                    <p className="mt-1 font-semibold">
                      {packetCount ?? "—"} packets · {duration ?? "—"} seconds
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="mt-1 text-sm font-medium">
                      {item.latitude}, {item.longitude}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50/60 px-4 py-3">
                  <p className="min-w-0 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Owner:</span>{" "}
                    {owner?.name || "Unavailable"}
                    <span className="mx-2">·</span>
                    <span className="font-medium text-foreground">VTS:</span>{" "}
                    {provider?.trade_name || provider?.name || "Unavailable"}
                    <span className="mx-2">·</span>
                    <span className="font-medium text-foreground">IMEI:</span>{" "}
                    {device?.imei || "—"}
                  </p>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <IncidentTripHistoryDialog candidateId={item.id} vehicleLabel={vehicleName(item)} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={expanded}
                      aria-controls={`violation-details-${item.id}`}
                      onClick={() => toggleDetails(item.id)}
                      className="text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
                    >
                      {expanded ? "View less" : "View more details"}
                      {expanded ? <ChevronUp /> : <ChevronDown />}
                    </Button>
                  </div>
                </div>
              </div>

              {expanded ? (
                <div id={`violation-details-${item.id}`} className="border-y bg-slate-50/60 p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Identity and service context
                  </p>
                  <div className="grid gap-3 lg:grid-cols-3">
                    <div className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <CarFront className="size-4 text-emerald-700" />
                          <p className="text-sm font-semibold">Vehicle</p>
                        </div>
                        {vehicle ? <Badge variant="outline">{label(vehicle.verification_status)}</Badge> : null}
                      </div>
                      <p className="mt-3 font-semibold">{vehicleName(item)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[vehicle?.brand, vehicle?.model, vehicle?.manufacturing_year].filter(Boolean).join(" · ") || "Vehicle profile unavailable"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {label(vehicle?.vehicle_type)} · {label(vehicle?.vehicle_category)} · {label(vehicle?.movement_state)}
                      </p>
                      {vehicle ? (
                        <Button asChild size="sm" variant="outline" className="mt-4 w-full">
                          <Link href={`/super-admin/vehicles/${vehicle.id}`}>
                            View vehicle profile <ExternalLink />
                          </Link>
                        </Button>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <UserRound className="size-4 text-emerald-700" />
                          <p className="text-sm font-semibold">Vehicle owner</p>
                        </div>
                        {owner ? <Badge variant="outline">{label(owner.verification_status)}</Badge> : null}
                      </div>
                      <p className="mt-3 font-semibold">{owner?.name || "Owner profile unavailable"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {owner?.owner_code || "No owner code"} · {label(owner?.owner_type)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[owner?.district, owner?.phone].filter(Boolean).join(" · ") || "No contact summary"}
                      </p>
                      {owner ? (
                        <Button asChild size="sm" variant="outline" className="mt-4 w-full">
                          <Link href={`/super-admin/owners/${owner.id}`}>
                            View owner profile <ExternalLink />
                          </Link>
                        </Button>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-4 text-emerald-700" />
                          <p className="text-sm font-semibold">VTS provider</p>
                        </div>
                        {provider ? <Badge variant="outline">{label(provider.status)}</Badge> : null}
                      </div>
                      <p className="mt-3 font-semibold">{provider?.trade_name || provider?.name || "Provider profile unavailable"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {provider?.code || "No provider code"} · {label(provider?.integration_status)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[provider?.phone, provider?.email].filter(Boolean).join(" · ") || "No contact summary"}
                      </p>
                      {provider ? (
                        <Button asChild size="sm" variant="outline" className="mt-4 w-full">
                          <Link href={`/super-admin/providers/${provider.id}`}>
                            View provider profile <ExternalLink />
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <IncidentDriverContextCard candidateId={item.id} />

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <RadioTower className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Incident device</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          IMEI: {device?.imei || "—"} · Protocol: {device?.protocol || "—"} · Source: {device?.source_code || "—"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {label(device?.operational_status)} · certification {label(device?.certification_status)} · last seen {dateTime(device?.last_seen_at)}
                        </p>
                      </div>
                    </div>
                    {device ? <Badge variant="outline">{device.manufacturer || device.model || device.device_identifier}</Badge> : null}
                  </div>

                  {ruleName || policyName ? (
                    <div className="mt-3 rounded-xl border bg-white p-3 text-sm">
                      <span className="font-medium">Rule:</span> {ruleName ?? "—"}
                      <span className="mx-2 text-muted-foreground">·</span>
                      <span className="font-medium">Policy:</span> {policyName ?? "—"}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="p-5">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    value={notes[item.id] || ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    placeholder="Mandatory review note"
                  />
                  <Button
                    variant="outline"
                    disabled={pendingId === item.id}
                    onClick={() => void decide(item.id, "reject")}
                    className="text-rose-700"
                  >
                    {pendingId === item.id ? <Loader2 className="animate-spin" /> : <XCircle />}
                    Reject
                  </Button>
                  <Button
                    disabled={pendingId === item.id}
                    onClick={() => void decide(item.id, "approve")}
                    className="bg-emerald-800 hover:bg-emerald-900"
                  >
                    {pendingId === item.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Approve & create case
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
