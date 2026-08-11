"use client"

import {
  Building2,
  CheckCircle2,
  Clock3,
  Link2,
  Loader2,
  Network,
  ShieldCheck,
  Unlink,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { OwnerProviderLink } from "@/features/owner/types"

type Action = "approve" | "reject" | "unlink"

type ActionTarget = {
  link: OwnerProviderLink
  action: Action
}

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null) {
  if (!value) {
    return "Not available"
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

async function parseResponse(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "The request could not be completed."
    throw new Error(message)
  }
  return payload
}

export function ProviderConnections({ links }: { links: OwnerProviderLink[] }) {
  const router = useRouter()
  const [target, setTarget] = useState<ActionTarget | null>(null)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const summary = useMemo(
    () => ({
      total: links.length,
      active: links.filter((link) => link.status === "active").length,
      awaitingOwner: links.filter((link) => link.status === "pending_owner_approval").length,
      awaitingProvider: links.filter((link) => link.status === "pending_provider_approval").length,
    }),
    [links]
  )

  const openAction = (link: OwnerProviderLink, action: Action) => {
    setTarget({ link, action })
    setNotes("")
  }

  const submit = async () => {
    if (!target) {
      return
    }
    const reasonRequired = target.action !== "approve"
    if (reasonRequired && notes.trim().length < 3) {
      return
    }

    setSubmitting(true)
    try {
      const endpoint =
        target.action === "unlink"
          ? `/api/owner/provider-links/${target.link.id}/unlink`
          : `/api/owner/provider-links/${target.link.id}/respond`
      const body =
        target.action === "unlink"
          ? { reason: notes.trim() }
          : { decision: target.action, notes: notes.trim() }

      await parseResponse(
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      )

      const message =
        target.action === "approve"
          ? `${target.link.provider_name} is now connected.`
          : target.action === "reject"
            ? `${target.link.provider_name} request was rejected.`
            : `${target.link.provider_name} was disconnected.`
      toast.success(message)
      setTarget(null)
      setNotes("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update provider access.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Provider records", value: summary.total, icon: Network },
          { label: "Active providers", value: summary.active, icon: ShieldCheck },
          { label: "Your approval due", value: summary.awaitingOwner, icon: Clock3 },
          { label: "Provider approval due", value: summary.awaitingProvider, icon: Building2 },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-3 text-3xl font-semibold">{value}</p>
              </div>
              <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                <Icon aria-hidden="true" className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="mt-6">
        <CardHeader className="border-b">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle>VTS provider connections</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                A provider receives access only after the required party approves the link.
              </p>
            </div>
            <Badge variant="secondary">{links.length} record{links.length === 1 ? "" : "s"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {links.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {links.map((link) => {
                const ownerDecisionDue = link.status === "pending_owner_approval"
                const active = link.status === "active"
                return (
                  <article key={link.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                          <Network aria-hidden="true" className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">{link.provider_name}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Provider code {link.provider_code}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={link.status} />
                    </div>

                    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <dt className="text-xs text-muted-foreground">Requested by</dt>
                        <dd className="mt-1 font-medium capitalize">{link.requested_by}</dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <dt className="text-xs text-muted-foreground">Requested</dt>
                        <dd className="mt-1 font-medium">{formatDate(link.requested_at)}</dd>
                      </div>
                    </dl>

                    {link.reason ? (
                      <p className="mt-4 rounded-xl border bg-slate-50 px-3 py-2.5 text-sm text-muted-foreground">
                        {link.reason}
                      </p>
                    ) : null}

                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      {ownerDecisionDue ? (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => openAction(link, "reject")}
                          >
                            <XCircle aria-hidden="true" /> Reject
                          </Button>
                          <Button
                            className="bg-emerald-800 text-white hover:bg-emerald-900"
                            onClick={() => openAction(link, "approve")}
                          >
                            <CheckCircle2 aria-hidden="true" /> Approve provider
                          </Button>
                        </>
                      ) : null}
                      {active ? (
                        <Button
                          variant="outline"
                          className="text-red-700 hover:text-red-800"
                          onClick={() => openAction(link, "unlink")}
                        >
                          <Unlink aria-hidden="true" /> Disconnect
                        </Button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 px-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                <Link2 aria-hidden="true" className="size-7" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No provider connections</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                Provider link requests will appear here when you or a VTS provider initiates a connection.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && !submitting && setTarget(null)}>
        <DialogContent>
          {target ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {target.action === "approve"
                    ? `Approve ${target.link.provider_name}`
                    : target.action === "reject"
                      ? `Reject ${target.link.provider_name}`
                      : `Disconnect ${target.link.provider_name}`}
                </DialogTitle>
                <DialogDescription>
                  {target.action === "approve"
                    ? "The provider will be allowed to manage approved vehicle and tracking services within the active link scope."
                    : target.action === "reject"
                      ? "The provider request will be rejected and no operational access will be granted."
                      : "Active tracking assignments associated with this provider may be ended by the backend."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="connection-notes">
                  {target.action === "approve" ? "Notes (optional)" : "Reason *"}
                </Label>
                <Textarea
                  id="connection-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  disabled={submitting}
                  placeholder={
                    target.action === "approve"
                      ? "Add any note for your provider..."
                      : "Explain the reason for this action..."
                  }
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setTarget(null)} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  onClick={submit}
                  disabled={submitting || (target.action !== "approve" && notes.trim().length < 3)}
                  className={
                    target.action === "approve"
                      ? "bg-emerald-800 text-white hover:bg-emerald-900"
                      : "bg-red-700 text-white hover:bg-red-800"
                  }
                >
                  {submitting ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : target.action === "approve" ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <XCircle aria-hidden="true" />
                  )}
                  {submitting ? "Submitting..." : "Confirm action"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
