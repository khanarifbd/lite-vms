"use client"

import { CheckCircle2, Loader2, RefreshCw, UserRoundCheck } from "lucide-react"
import { useMemo, useState } from "react"

import { AssignmentEndButton } from "@/components/assignments/assignment-end-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import type { ProviderVehicleDriverWorkspace } from "@/features/provider/vehicle-driver-types"

type Props = {
  vehicleId: string
  initialWorkspace: ProviderVehicleDriverWorkspace
  canManage: boolean
  apiBase?: string
  actorLabel?: string
}

export function ProviderVehicleDriverManager({
  vehicleId,
  initialWorkspace,
  canManage,
  apiBase = "/api/provider/vehicles",
  actorLabel = "VTS provider",
}: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [selectedDriverId, setSelectedDriverId] = useState("")
  const [assignPending, setAssignPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eligibleDrivers = useMemo(
    () => workspace.candidates.filter((driver) => driver.available_for_assignment),
    [workspace.candidates]
  )
  const selectedDriver = workspace.candidates.find((driver) => driver.id === selectedDriverId)

  async function reload() {
    const response = await fetch(`${apiBase}/${encodeURIComponent(vehicleId)}/drivers`)
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.message || "Unable to refresh drivers.")
    setWorkspace(body)
    setSelectedDriverId("")
  }

  async function assign() {
    if (!selectedDriver) return
    setAssignPending(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(`${apiBase}/${encodeURIComponent(vehicleId)}/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: selectedDriver.id,
          start_on_duty: true,
          notes: `Assigned by ${actorLabel} to ${workspace.registration_number}`,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.message || "Unable to assign driver.")
      const assignedName = selectedDriver.full_name
      await reload()
      setMessage(`${assignedName} has been assigned and placed on duty.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to assign driver.")
    } finally {
      setAssignPending(false)
    }
  }

  async function handleUnassigned(fullName: string) {
    await reload()
    setMessage(`${fullName} has been unassigned. The mandatory reason was saved in the audit history.`)
  }

  return (
    <div className="space-y-6">
      {message ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>Driver assignment updated</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Assignment update failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserRoundCheck className="size-5" /> Active vehicle drivers
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Drivers currently assigned to this vehicle. A reason is required for every unassignment. Ending an on-duty assignment also closes its duty session.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={assignPending} onClick={() => void reload()}>
            <RefreshCw /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {workspace.active_assignments.length ? (
            workspace.active_assignments.map((assignment) => (
              <div key={assignment.id} className="flex flex-col justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold">{assignment.full_name}</p>
                  <p className="text-sm text-muted-foreground">{assignment.driver_code} · {assignment.phone}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{assignment.status.replaceAll("_", " ")}</Badge>
                  {assignment.is_on_duty ? <Badge>On duty</Badge> : null}
                  {canManage ? (
                    <AssignmentEndButton
                      assignmentId={assignment.id}
                      endpoint={`${apiBase}/${encodeURIComponent(vehicleId)}/drivers`}
                      subjectName={assignment.full_name}
                      vehicleRegistration={workspace.registration_number}
                      triggerLabel="Unassign driver"
                      title={`Unassign ${assignment.full_name}?`}
                      description={`${actorLabel} must provide a reason before this driver can be removed from the vehicle roster.`}
                      disabled={assignPending}
                      onEnded={() => handleUnassigned(assignment.full_name)}
                    />
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <Alert>
              <AlertTitle>No active driver assigned</AlertTitle>
              <AlertDescription>
                This vehicle currently has no driver. Select an eligible owner-linked driver below when needed.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assign owner-linked driver</CardTitle>
          <p className="text-sm text-muted-foreground">
            The dropdown only contains eligible drivers with an active link to this vehicle owner.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="linked-driver">Driver</Label>
            <select
              id="linked-driver"
              value={selectedDriverId}
              onChange={(event) => setSelectedDriverId(event.target.value)}
              disabled={!canManage || !workspace.can_assign || assignPending || eligibleDrivers.length === 0}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Select an owner-linked driver</option>
              {eligibleDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name} · {driver.driver_code} · {driver.phone}
                </option>
              ))}
            </select>
          </div>

          {selectedDriver ? (
            <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <p><span className="text-muted-foreground">District:</span> {selectedDriver.district}</p>
              <p><span className="text-muted-foreground">Licence:</span> {selectedDriver.licence_number || "Not available"}</p>
              <p><span className="text-muted-foreground">Driver status:</span> {selectedDriver.verification_status.replaceAll("_", " ")}</p>
              <p><span className="text-muted-foreground">Licence status:</span> {selectedDriver.licence_status?.replaceAll("_", " ") || "Not available"}</p>
            </div>
          ) : null}

          {!eligibleDrivers.length ? (
            <Alert>
              <AlertTitle>No assignable linked driver</AlertTitle>
              <AlertDescription>
                The owner must first connect an active, police-verified driver with a valid verified licence. Drivers already assigned elsewhere are excluded.
              </AlertDescription>
            </Alert>
          ) : null}

          <Button className="w-full sm:w-auto" disabled={!selectedDriver || !canManage || !workspace.can_assign || assignPending} onClick={() => void assign()}>
            {assignPending ? <Loader2 className="animate-spin" /> : <UserRoundCheck />}
            Assign and start duty
          </Button>

          {workspace.candidates.some((driver) => !driver.available_for_assignment) ? (
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">Linked drivers currently unavailable</p>
              <div className="space-y-2">
                {workspace.candidates.filter((driver) => !driver.available_for_assignment).map((driver) => (
                  <div key={driver.id} className="flex flex-col justify-between gap-1 rounded-xl border p-3 text-sm sm:flex-row sm:items-center">
                    <span>{driver.full_name} · {driver.driver_code}</span>
                    <span className="text-amber-700">{driver.unavailable_reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
