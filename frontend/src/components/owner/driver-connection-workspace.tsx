"use client"

import {
  CarFront,
  CheckCircle2,
  Clock3,
  IdCard,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Unlink,
  UserRoundCheck,
  UserRoundMinus,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type {
  OwnerDriverAssignment,
  OwnerDriverConnection,
  OwnerDriverLinkPage,
  OwnerDriverLookupResult,
  OwnerVehiclePage,
} from "@/features/owner/types"

type ConnectionAction = "approve" | "reject" | "cancel" | "disconnect"
type ActionTarget = { connection: OwnerDriverConnection; action: ConnectionAction }
type RosterAction = "start-duty" | "end"
type RosterActionTarget = {
  assignment: OwnerDriverAssignment
  driverName: string
  action: RosterAction
}

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "The request could not be completed."
    )
  }
  return payload as T
}

export function DriverConnectionWorkspace({
  links,
  vehicles,
  assignments,
}: {
  links: OwnerDriverLinkPage
  vehicles: OwnerVehiclePage
  assignments: OwnerDriverAssignment[]
}) {
  const router = useRouter()
  const [nid, setNid] = useState("")
  const [lookup, setLookup] = useState<OwnerDriverLookupResult | null>(null)
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const [assignmentTarget, setAssignmentTarget] = useState<OwnerDriverConnection | null>(null)
  const [rosterActionTarget, setRosterActionTarget] = useState<RosterActionTarget | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState("")
  const [startOnDuty, setStartOnDuty] = useState(false)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const incoming = links.items.filter(
    (item) => item.status === "pending_organization_approval"
  )
  const outgoing = links.items.filter((item) => item.status === "pending_driver_approval")
  const active = links.items.filter((item) => item.status === "active")
  const history = links.items.filter((item) =>
    ["ended", "rejected", "suspended"].includes(item.status)
  )
  const assignableVehicles = useMemo(
    () =>
      vehicles.items.filter(
        (vehicle) =>
          vehicle.verification_status === "verified" &&
          vehicle.status === "active"
      ),
    [vehicles.items]
  )
  const assignmentByDriver = useMemo(
    () =>
      new Map(
        assignments
          .filter((assignment) => assignment.status === "active")
          .map((assignment) => [assignment.driver_id, assignment])
      ),
    [assignments]
  )
  const vehicleById = useMemo(
    () => new Map(vehicles.items.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles.items]
  )

  async function lookupDriver() {
    if (nid.trim().length < 10) {
      toast.error("Enter a valid NID reference.")
      return
    }
    setSubmitting(true)
    setLookup(null)
    try {
      const response = await fetch("/api/owner/driver-connections/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nid_reference: nid.trim() }),
      })
      setLookup(await readResponse<OwnerDriverLookupResult>(response))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Driver lookup failed.")
    } finally {
      setSubmitting(false)
    }
  }

  async function sendDriverRequest() {
    if (!lookup?.driver_id || !lookup.can_send_request) return
    setSubmitting(true)
    try {
      const response = await fetch("/api/owner/driver-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: lookup.driver_id }),
      })
      await readResponse(response)
      toast.success("Connection request sent to the driver.")
      setLookup(null)
      setNid("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request the driver.")
    } finally {
      setSubmitting(false)
    }
  }

  async function runConnectionAction() {
    if (!actionTarget) return
    const requiresReason = actionTarget.action !== "approve"
    if (requiresReason && notes.trim().length < 3) {
      toast.error("Enter a reason of at least 3 characters.")
      return
    }

    setSubmitting(true)
    const isResponse = ["approve", "reject"].includes(actionTarget.action)
    const action = isResponse ? "respond" : "unlink"
    const body = isResponse
      ? {
          decision: actionTarget.action,
          notes: notes.trim() || null,
        }
      : { reason: notes.trim() }

    try {
      const response = await fetch(
        `/api/owner/driver-connections/${actionTarget.connection.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      await readResponse(response)
      toast.success(
        actionTarget.action === "approve"
          ? "Driver connection approved."
          : actionTarget.action === "reject"
            ? "Driver request rejected."
            : actionTarget.action === "cancel"
              ? "Driver request cancelled."
              : "Driver disconnected and active assignments ended."
      )
      setActionTarget(null)
      setNotes("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update connection.")
    } finally {
      setSubmitting(false)
    }
  }

  async function assignVehicle() {
    if (!assignmentTarget || !selectedVehicleId || notes.trim().length < 3) {
      toast.error("Select a verified vehicle and enter an assignment note.")
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch("/api/owner/driver-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: selectedVehicleId,
          driver_id: assignmentTarget.driver_id,
          start_on_duty: startOnDuty,
          notes: notes.trim(),
        }),
      })
      await readResponse(response)
      toast.success("Driver assigned to the selected vehicle.")
      setAssignmentTarget(null)
      setSelectedVehicleId("")
      setStartOnDuty(false)
      setNotes("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to assign the driver.")
    } finally {
      setSubmitting(false)
    }
  }

  async function runRosterAction() {
    if (!rosterActionTarget || notes.trim().length < 3) {
      toast.error("Enter a reason of at least 3 characters.")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/owner/driver-assignments/${rosterActionTarget.assignment.id}/${rosterActionTarget.action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: notes.trim() }),
        }
      )
      await readResponse(response)
      toast.success(
        rosterActionTarget.action === "start-duty"
          ? "Duty handed over. The previous driver remains on the roster as standby."
          : "Driver removed from this vehicle roster."
      )
      setRosterActionTarget(null)
      setNotes("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the roster.")
    } finally {
      setSubmitting(false)
    }
  }

  function openAction(connection: OwnerDriverConnection, action: ConnectionAction) {
    setActionTarget({ connection, action })
    setNotes("")
  }

  function connectionCard(connection: OwnerDriverConnection) {
    const currentAssignment = assignmentByDriver.get(connection.driver_id)
    const assignedVehicle = currentAssignment
      ? vehicleById.get(currentAssignment.vehicle_id)
      : null
    const canRespond = connection.status === "pending_organization_approval"
    const canCancel = connection.status === "pending_driver_approval"
    const canDisconnect = ["active", "suspended"].includes(connection.status)

    return (
      <article key={connection.id} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{connection.driver_name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Requested by {connection.requested_by.replaceAll("_", " ")} · {formatDate(connection.requested_at)}
            </p>
          </div>
          <StatusBadge status={connection.status} />
        </div>
        {connection.reason ? (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-muted-foreground">
            {connection.reason}
          </p>
        ) : null}
        {currentAssignment ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Vehicle roster</p>
              <p className="truncate text-sm font-semibold">
                {assignedVehicle?.registration_number_display ||
                  assignedVehicle?.registration_number ||
                  currentAssignment.vehicle_id}
              </p>
            </div>
            <Badge
              className={
                currentAssignment.is_on_duty
                  ? "bg-emerald-700 text-white hover:bg-emerald-700"
                  : "bg-amber-100 text-amber-900 hover:bg-amber-100"
              }
            >
              {currentAssignment.is_on_duty ? "On duty" : "Standby"}
            </Badge>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {canRespond ? (
            <>
              <Button size="sm" variant="outline" onClick={() => openAction(connection, "reject")}>
                <XCircle /> Reject
              </Button>
              <Button size="sm" className="bg-emerald-800 text-white hover:bg-emerald-900" onClick={() => openAction(connection, "approve")}>
                <CheckCircle2 /> Approve
              </Button>
            </>
          ) : null}
          {canCancel ? (
            <Button size="sm" variant="outline" className="text-red-700" onClick={() => openAction(connection, "cancel")}>
              <XCircle /> Cancel request
            </Button>
          ) : null}
          {canDisconnect ? (
            <>
              {connection.status === "active" && !currentAssignment ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAssignmentTarget(connection)
                    setSelectedVehicleId("")
                    setStartOnDuty(false)
                    setNotes("")
                  }}
                >
                  <CarFront /> Add to vehicle roster
                </Button>
              ) : null}
              {connection.status === "active" && currentAssignment && !currentAssignment.is_on_duty ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRosterActionTarget({
                      assignment: currentAssignment,
                      driverName: connection.driver_name,
                      action: "start-duty",
                    })
                    setNotes("")
                  }}
                >
                  <RefreshCw /> Start duty
                </Button>
              ) : null}
              {connection.status === "active" && currentAssignment ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-700"
                  onClick={() => {
                    setRosterActionTarget({
                      assignment: currentAssignment,
                      driverName: connection.driver_name,
                      action: "end",
                    })
                    setNotes("")
                  }}
                >
                  <UserRoundMinus /> End roster assignment
                </Button>
              ) : null}
              <Button size="sm" variant="outline" className="text-red-700" onClick={() => openAction(connection, "disconnect")}>
                <Unlink /> Disconnect
              </Button>
            </>
          ) : null}
        </div>
      </article>
    )
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active drivers", value: active.length, icon: UserRoundCheck },
          { label: "Owner decisions", value: incoming.length, icon: ShieldCheck },
          { label: "Driver decisions", value: outgoing.length, icon: Clock3 },
          { label: "Consent history", value: history.length, icon: IdCard },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-5">
              <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>
              <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                <Icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Connect an existing driver</CardTitle>
          <p className="text-sm text-muted-foreground">
            Search the national registry by NID. Sensitive identity and licence values remain masked.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={nid} onChange={(event) => setNid(event.target.value)} placeholder="Driver NID reference" className="pl-9" />
            </div>
            <Button onClick={() => void lookupDriver()} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Search />} Search registry
            </Button>
          </div>
          {lookup ? (
            lookup.exists ? (
              <Alert>
                <IdCard />
                <AlertTitle>{lookup.driver_name}</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                  <p>
                    NID {lookup.masked_nid_reference || "masked"} · Mobile {lookup.masked_mobile || "masked"} · Licence {lookup.masked_licence_number || "pending"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {lookup.driver_verification_status ? <StatusBadge status={lookup.driver_verification_status} /> : null}
                    {lookup.owner_link_status ? <StatusBadge status={lookup.owner_link_status} /> : <Badge variant="outline">Not connected</Badge>}
                    <Button size="sm" disabled={!lookup.can_send_request || submitting} onClick={() => void sendDriverRequest()}>
                      <Link2 /> {lookup.can_send_request ? "Send connection request" : "Connection unavailable"}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <IdCard />
                <AlertTitle>Driver is not registered</AlertTitle>
                <AlertDescription>
                  Ask the driver to complete mobile-first registration. After the national record exists, search again and send consent.
                </AlertDescription>
              </Alert>
            )
          ) : null}
        </CardContent>
      </Card>

      {incoming.length ? (
        <Card>
          <CardHeader className="border-b"><CardTitle>Requests awaiting your decision</CardTitle></CardHeader>
          <CardContent className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">{incoming.map(connectionCard)}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="border-b"><CardTitle>Active driver pool</CardTitle></CardHeader>
        <CardContent className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
          {active.length ? active.map(connectionCard) : (
            <p className="col-span-full rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center text-sm text-muted-foreground">
              No active owner-driver connection is available.
            </p>
          )}
        </CardContent>
      </Card>

      {outgoing.length ? (
        <Card>
          <CardHeader className="border-b"><CardTitle>Awaiting driver approval</CardTitle></CardHeader>
          <CardContent className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">{outgoing.map(connectionCard)}</CardContent>
        </Card>
      ) : null}

      {history.length ? (
        <Card>
          <CardHeader className="border-b"><CardTitle>Consent history</CardTitle></CardHeader>
          <CardContent className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">{history.map(connectionCard)}</CardContent>
        </Card>
      ) : null}

      <Dialog open={Boolean(actionTarget)} onOpenChange={(open) => !open && !submitting && setActionTarget(null)}>
        <DialogContent>
          {actionTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {actionTarget.action === "approve" ? "Approve driver connection" : actionTarget.action === "reject" ? "Reject driver request" : actionTarget.action === "cancel" ? "Cancel driver request" : "Disconnect driver"}
                </DialogTitle>
                <DialogDescription>
                  This decision and its reason are retained in the national audit history.
                </DialogDescription>
              </DialogHeader>
              <Alert><UserRoundCheck /><AlertTitle>{actionTarget.connection.driver_name}</AlertTitle><AlertDescription>{actionTarget.connection.status.replaceAll("_", " ")}</AlertDescription></Alert>
              <div className="space-y-2">
                <Label htmlFor="driver-connection-notes">{actionTarget.action === "approve" ? "Decision note" : "Reason *"}</Label>
                <Textarea id="driver-connection-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={1000} disabled={submitting} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionTarget(null)} disabled={submitting}>Back</Button>
                <Button onClick={() => void runConnectionAction()} disabled={submitting || (actionTarget.action !== "approve" && notes.trim().length < 3)} className={actionTarget.action === "approve" ? "bg-emerald-800 text-white hover:bg-emerald-900" : "bg-red-700 text-white hover:bg-red-800"}>
                  {submitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirm
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignmentTarget)} onOpenChange={(open) => !open && !submitting && setAssignmentTarget(null)}>
        <DialogContent>
          {assignmentTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Assign {assignmentTarget.driver_name}</DialogTitle>
                <DialogDescription>
                  A vehicle can keep multiple active roster drivers, but only one can be on duty at a time. A driver can belong to one active vehicle roster.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="assignment-vehicle">Verified vehicle</Label>
                <select id="assignment-vehicle" value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm" disabled={submitting}>
                  <option value="">Select a vehicle</option>
                  {assignableVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registration_number_display || vehicle.registration_number}{vehicle.current_driver_name ? ` · Current: ${vehicle.current_driver_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-3 rounded-xl border bg-slate-50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={startOnDuty}
                  onChange={(event) => setStartOnDuty(event.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="block font-medium">Start this driver on duty now</span>
                  <span className="text-xs text-muted-foreground">
                    The current driver will move to standby without leaving the roster.
                  </span>
                </span>
              </label>
              <div className="space-y-2">
                <Label htmlFor="assignment-note">Assignment note *</Label>
                <Textarea id="assignment-note" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={1000} disabled={submitting} placeholder="Duty, shift, or operational reason" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignmentTarget(null)} disabled={submitting}>Cancel</Button>
                <Button onClick={() => void assignVehicle()} disabled={submitting || !selectedVehicleId || notes.trim().length < 3} className="bg-emerald-800 text-white hover:bg-emerald-900">
                  {submitting ? <Loader2 className="animate-spin" /> : <CarFront />} Assign vehicle
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rosterActionTarget)}
        onOpenChange={(open) =>
          !open && !submitting && setRosterActionTarget(null)
        }
      >
        <DialogContent>
          {rosterActionTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {rosterActionTarget.action === "start-duty"
                    ? `Start duty for ${rosterActionTarget.driverName}`
                    : `End roster assignment for ${rosterActionTarget.driverName}`}
                </DialogTitle>
                <DialogDescription>
                  {rosterActionTarget.action === "start-duty"
                    ? "The current on-duty driver will become standby; both drivers remain actively assigned."
                    : "This removes only this driver from the vehicle roster. The reason is retained in the audit log."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="roster-action-reason">Reason *</Label>
                <Textarea
                  id="roster-action-reason"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  disabled={submitting}
                  placeholder="Shift handover, relief period, journey completed..."
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRosterActionTarget(null)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void runRosterAction()}
                  disabled={submitting || notes.trim().length < 3}
                  className={
                    rosterActionTarget.action === "start-duty"
                      ? "bg-emerald-800 text-white hover:bg-emerald-900"
                      : "bg-red-700 text-white hover:bg-red-800"
                  }
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" />
                  ) : rosterActionTarget.action === "start-duty" ? (
                    <RefreshCw />
                  ) : (
                    <UserRoundMinus />
                  )}
                  Confirm
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
