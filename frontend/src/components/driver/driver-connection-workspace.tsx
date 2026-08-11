"use client"

import {
  CheckCircle2,
  Link2,
  Loader2,
  Network,
  Unlink,
  UserRoundCheck,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { DriverLink } from "@/features/driver/types"

type LinkAction = "approve" | "reject" | "cancel" | "disconnect"
type ActionTarget = { link: DriverLink; action: LinkAction }

async function readResponse(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "The connection request could not be completed."
    )
  }
  return payload
}

export function DriverConnectionWorkspace({ links }: { links: DriverLink[] }) {
  const router = useRouter()
  const [requestOpen, setRequestOpen] = useState(false)
  const [ownerCode, setOwnerCode] = useState("")
  const [notes, setNotes] = useState("")
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function requestOwner() {
    if (ownerCode.trim().length < 3) {
      toast.error("Enter the vehicle owner's exact Owner Code.")
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch("/api/driver/owner-links/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_code: ownerCode.trim().toUpperCase(),
          notes: notes.trim() || null,
        }),
      })
      await readResponse(response)
      toast.success("Connection request sent to the vehicle owner.")
      setRequestOpen(false)
      setOwnerCode("")
      setNotes("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request the owner.")
    } finally {
      setSubmitting(false)
    }
  }

  async function runAction() {
    if (!actionTarget) return
    const requiresReason = actionTarget.action !== "approve"
    if (requiresReason && notes.trim().length < 3) {
      toast.error("Enter a reason of at least 3 characters.")
      return
    }

    setSubmitting(true)
    try {
      const isDecision = ["approve", "reject"].includes(actionTarget.action)
      const endpoint = isDecision
        ? `/api/driver/links/${actionTarget.link.link_id}/respond`
        : `/api/driver/owner-links/${actionTarget.link.link_id}/unlink`
      const body = isDecision
        ? {
            decision: actionTarget.action,
            notes: notes.trim() || null,
          }
        : { reason: notes.trim() }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      await readResponse(response)
      toast.success(
        actionTarget.action === "approve"
          ? "Connection approved."
          : actionTarget.action === "reject"
            ? "Connection rejected."
            : actionTarget.action === "cancel"
              ? "Owner request cancelled."
              : "Owner connection ended."
      )
      setActionTarget(null)
      setNotes("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the connection.")
    } finally {
      setSubmitting(false)
    }
  }

  function openAction(link: DriverLink, action: LinkAction) {
    setActionTarget({ link, action })
    setNotes("")
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">
            Connections
          </p>
          <h2 className="mt-1 text-lg font-semibold">Owner and VTS provider links</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{links.length} records</Badge>
          <Button size="sm" onClick={() => { setRequestOpen(true); setNotes("") }}>
            <Link2 /> Request owner
          </Button>
        </div>
      </div>

      {links.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => {
            const ownerLink = link.organization_type === "vehicle_owner"
            return (
              <article key={link.link_id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{link.organization_name}</p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {link.organization_type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <StatusBadge status={link.status} />
                </div>
                {link.status === "active" ? (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-700">
                    <CheckCircle2 className="size-3.5" /> Active connection
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {link.status === "pending_driver_approval" ? (
                    <>
                      <Button size="sm" variant="outline" className="h-8 flex-1 text-xs text-red-700" onClick={() => openAction(link, "reject")}>
                        <XCircle /> Reject
                      </Button>
                      <Button size="sm" className="h-8 flex-1 bg-emerald-700 text-xs text-white hover:bg-emerald-800" onClick={() => openAction(link, "approve")}>
                        <CheckCircle2 /> Approve
                      </Button>
                    </>
                  ) : null}
                  {ownerLink && link.status === "pending_organization_approval" ? (
                    <Button size="sm" variant="outline" className="h-8 w-full text-xs text-red-700" onClick={() => openAction(link, "cancel")}>
                      <XCircle /> Cancel request
                    </Button>
                  ) : null}
                  {ownerLink && ["active", "suspended"].includes(link.status) ? (
                    <Button size="sm" variant="outline" className="h-8 w-full text-xs text-red-700" onClick={() => openAction(link, "disconnect")}>
                      <Unlink /> End owner connection
                    </Button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50 text-center">
          <Network className="size-7 text-emerald-700" />
          <p className="mt-2 text-sm font-semibold">No organization links yet</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Ask an owner for their Owner Code, or wait for an owner or provider invitation.
          </p>
        </div>
      )}

      <Dialog open={requestOpen} onOpenChange={(open) => !submitting && setRequestOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a vehicle owner</DialogTitle>
            <DialogDescription>
              Use the exact Owner Code shared by the owner. Owner NIDs are never exposed or searchable.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <UserRoundCheck />
            <AlertTitle>Owner approval required</AlertTitle>
            <AlertDescription>
              The connection remains pending until that vehicle owner approves it.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="owner-code">Owner Code</Label>
            <Input id="owner-code" value={ownerCode} onChange={(event) => setOwnerCode(event.target.value.toUpperCase())} maxLength={40} placeholder="Example: OWN-AB12CD34" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-request-note">Request note</Label>
            <Textarea id="owner-request-note" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={1000} disabled={submitting} placeholder="Introduce the duty or employment request" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={() => void requestOwner()} disabled={submitting || ownerCode.trim().length < 3} className="bg-emerald-800 text-white hover:bg-emerald-900">
              {submitting ? <Loader2 className="animate-spin" /> : <Link2 />} Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(actionTarget)} onOpenChange={(open) => !open && !submitting && setActionTarget(null)}>
        <DialogContent>
          {actionTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {actionTarget.action === "approve" ? "Approve connection" : actionTarget.action === "reject" ? "Reject connection" : actionTarget.action === "cancel" ? "Cancel owner request" : "End owner connection"}
                </DialogTitle>
                <DialogDescription>
                  The decision, actor, timestamp, and reason are retained in the audit log.
                </DialogDescription>
              </DialogHeader>
              <Alert>
                <Network />
                <AlertTitle>{actionTarget.link.organization_name}</AlertTitle>
                <AlertDescription>{actionTarget.link.organization_type.replaceAll("_", " ")}</AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="driver-link-note">{actionTarget.action === "approve" ? "Decision note" : "Reason *"}</Label>
                <Textarea id="driver-link-note" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={1000} disabled={submitting} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionTarget(null)} disabled={submitting}>Back</Button>
                <Button onClick={() => void runAction()} disabled={submitting || (actionTarget.action !== "approve" && notes.trim().length < 3)} className={actionTarget.action === "approve" ? "bg-emerald-800 text-white hover:bg-emerald-900" : "bg-red-700 text-white hover:bg-red-800"}>
                  {submitting ? <Loader2 className="animate-spin" /> : actionTarget.action === "approve" ? <CheckCircle2 /> : <XCircle />} Confirm
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
