"use client"

import {
  Building2,
  CheckCircle2,
  Clock3,
  Link2,
  Loader2,
  Network,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Unlink,
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
  OwnerProviderConnection,
  OwnerProviderConnectionWorkspace,
  OwnerProviderDirectoryItem,
  OwnerProviderVehicleScopeMode,
} from "@/features/owner/types"

type ConnectionAction = "approve" | "reject" | "cancel" | "disconnect"

type ActionTarget = {
  connection: OwnerProviderConnection
  action: ConnectionAction
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

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "The request could not be completed."
    throw new Error(message)
  }
  return payload as T
}

function connectionLabel(action: ConnectionAction) {
  if (action === "approve") return "Approve provider"
  if (action === "reject") return "Reject request"
  if (action === "cancel") return "Cancel request"
  return "Disconnect provider"
}

function Timeline({ connection }: { connection: OwnerProviderConnection }) {
  return (
    <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="font-medium text-slate-700">Requested</p>
        <p className="mt-1">{formatDate(connection.requested_at)}</p>
      </div>
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="font-medium text-slate-700">Responded</p>
        <p className="mt-1">{formatDate(connection.responded_at)}</p>
      </div>
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="font-medium text-slate-700">Ended</p>
        <p className="mt-1">{formatDate(connection.ended_at)}</p>
      </div>
    </div>
  )
}

export function ProviderConnectionWorkspace({
  workspace,
}: {
  workspace: OwnerProviderConnectionWorkspace
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [requestTarget, setRequestTarget] = useState<OwnerProviderDirectoryItem | null>(null)
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const [scopeTarget, setScopeTarget] = useState<OwnerProviderConnection | null>(null)
  const [scopeMode, setScopeMode] = useState<OwnerProviderVehicleScopeMode>("all")
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const incoming = workspace.connections.filter(
    (connection) => connection.status === "pending_owner_approval"
  )
  const active = workspace.connections.filter((connection) => connection.status === "active")
  const outgoing = workspace.connections.filter(
    (connection) => connection.status === "pending_provider_approval"
  )
  const history = workspace.connections.filter((connection) =>
    ["ended", "rejected", "suspended"].includes(connection.status)
  )

  const providers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return workspace.providers
    return workspace.providers.filter((provider) =>
      [
        provider.name,
        provider.trade_name,
        provider.code,
        provider.district,
        ...provider.service_coverage,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [search, workspace.providers])

  const refresh = () => router.refresh()

  const openScopeDialog = (connection: OwnerProviderConnection) => {
    setScopeTarget(connection)
    setScopeMode(connection.vehicle_scope_mode)
    setSelectedVehicleIds(connection.selected_vehicle_ids)
    setNotes("")
  }

  const toggleVehicle = (vehicleId: string) => {
    setSelectedVehicleIds((current) =>
      current.includes(vehicleId)
        ? current.filter((item) => item !== vehicleId)
        : [...current, vehicleId]
    )
  }

  const sendRequest = async () => {
    if (!requestTarget) return
    setSubmitting(true)
    try {
      await parseResponse<OwnerProviderConnection>(
        await fetch("/api/owner/provider-connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider_id: requestTarget.id,
            notes: notes.trim() || null,
          }),
        })
      )
      toast.success(`Connection request sent to ${requestTarget.name}.`)
      setRequestTarget(null)
      setNotes("")
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request provider access.")
    } finally {
      setSubmitting(false)
    }
  }

  const runAction = async () => {
    if (!actionTarget) return
    const reasonRequired = actionTarget.action !== "approve"
    if (reasonRequired && notes.trim().length < 3) return

    const endpointAction =
      actionTarget.action === "approve" || actionTarget.action === "reject"
        ? "respond"
        : actionTarget.action
    const payload =
      endpointAction === "respond"
        ? { decision: actionTarget.action, notes: notes.trim() || null }
        : { reason: notes.trim() }

    setSubmitting(true)
    try {
      await parseResponse<OwnerProviderConnection>(
        await fetch(
          `/api/owner/provider-connections/${actionTarget.connection.id}/${endpointAction}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        )
      )
      toast.success(`${connectionLabel(actionTarget.action)} completed.`)
      setActionTarget(null)
      setNotes("")
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update provider access.")
    } finally {
      setSubmitting(false)
    }
  }

  const saveScope = async () => {
    if (!scopeTarget) return
    setSubmitting(true)
    try {
      await parseResponse<OwnerProviderConnection>(
        await fetch(
          `/api/owner/provider-connections/${scopeTarget.id}/vehicle-scope`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scope_mode: scopeMode,
              vehicle_ids: scopeMode === "selected" ? selectedVehicleIds : [],
              reason: notes.trim() || null,
            }),
          }
        )
      )
      toast.success("Provider vehicle access updated.")
      setScopeTarget(null)
      setNotes("")
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update vehicle access.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active providers", value: workspace.stats.active, icon: ShieldCheck },
          {
            label: "Your approval due",
            value: workspace.stats.pending_owner_approval,
            icon: Clock3,
          },
          {
            label: "Provider approval due",
            value: workspace.stats.pending_provider_approval,
            icon: Building2,
          },
          {
            label: "Approved directory",
            value: workspace.stats.approved_providers,
            icon: Network,
          },
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

      {incoming.length ? (
        <Card className="border-amber-200">
          <CardHeader className="border-b bg-amber-50/70">
            <CardTitle>Provider requests awaiting your consent</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
            {incoming.map((connection) => (
              <article key={connection.id} className="rounded-2xl border bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{connection.provider_name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {connection.provider_code} · Requested by provider
                    </p>
                  </div>
                  <StatusBadge status={connection.status} />
                </div>
                <Timeline connection={connection} />
                {connection.reason ? (
                  <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-muted-foreground">
                    {connection.reason}
                  </p>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActionTarget({ connection, action: "reject" })
                      setNotes("")
                    }}
                  >
                    <XCircle aria-hidden="true" /> Reject
                  </Button>
                  <Button
                    className="bg-emerald-800 text-white hover:bg-emerald-900"
                    onClick={() => {
                      setActionTarget({ connection, action: "approve" })
                      setNotes("")
                    }}
                  >
                    <CheckCircle2 aria-hidden="true" /> Approve
                  </Button>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Active provider access</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {active.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {active.map((connection) => (
                <article key={connection.id} className="rounded-2xl border p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{connection.provider_name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {connection.provider_code} · {connection.provider_district || "Bangladesh"}
                      </p>
                    </div>
                    <StatusBadge status={connection.status} />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Vehicle scope</p>
                      <p className="mt-1 font-semibold">
                        {connection.vehicle_scope_mode === "all" ? "All vehicles" : "Selected"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Managed vehicles</p>
                      <p className="mt-1 font-semibold">{connection.managed_vehicle_count}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Active GPS</p>
                      <p className="mt-1 font-semibold">{connection.active_tracking_count}</p>
                    </div>
                  </div>
                  <Timeline connection={connection} />
                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => openScopeDialog(connection)}>
                      <SlidersHorizontal aria-hidden="true" /> Vehicle access
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-700 hover:text-red-800"
                      onClick={() => {
                        setActionTarget({ connection, action: "disconnect" })
                        setNotes("")
                      }}
                    >
                      <Unlink aria-hidden="true" /> Disconnect
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center text-sm text-muted-foreground">
              No active provider access is available.
            </p>
          )}
        </CardContent>
      </Card>

      {outgoing.length ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Requests awaiting provider approval</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
            {outgoing.map((connection) => (
              <article key={connection.id} className="rounded-2xl border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{connection.provider_name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sent {formatDate(connection.requested_at)}
                    </p>
                  </div>
                  <StatusBadge status={connection.status} />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    className="text-red-700 hover:text-red-800"
                    onClick={() => {
                      setActionTarget({ connection, action: "cancel" })
                      setNotes("")
                    }}
                  >
                    <XCircle aria-hidden="true" /> Cancel request
                  </Button>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <CardTitle>Approved VTS provider directory</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Search approved providers and initiate a consent request.
              </p>
            </div>
            <div className="relative w-full lg:w-80">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search provider, district or area"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {providers.length ? (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {providers.map((provider) => {
                const blocked = provider.current_link_status
                  ? [
                      "active",
                      "pending_owner_approval",
                      "pending_provider_approval",
                      "suspended",
                    ].includes(provider.current_link_status)
                  : false
                return (
                  <article key={provider.id} className="flex flex-col rounded-2xl border p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold">{provider.trade_name || provider.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {provider.name} · {provider.code}
                        </p>
                      </div>
                      {provider.current_link_status ? (
                        <StatusBadge status={provider.current_link_status} />
                      ) : (
                        <Badge variant="outline">Available</Badge>
                      )}
                    </div>
                    <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                      <p>{provider.district || "National coverage"}</p>
                      <p>{provider.support_phone || provider.support_email || "Support not published"}</p>
                    </div>
                    {provider.service_coverage.length ? (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {provider.service_coverage.slice(0, 4).map((area) => (
                          <Badge key={area} variant="secondary" className="font-normal">
                            {area}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <Button
                      className="mt-5 bg-emerald-800 text-white hover:bg-emerald-900"
                      disabled={blocked}
                      onClick={() => {
                        setRequestTarget(provider)
                        setNotes("")
                      }}
                    >
                      <Link2 aria-hidden="true" />
                      {blocked ? "Connection exists" : "Request connection"}
                    </Button>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center text-sm text-muted-foreground">
              No approved provider matches your search.
            </p>
          )}
        </CardContent>
      </Card>

      {history.length ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Consent history</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
            {history.map((connection) => (
              <article key={connection.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{connection.provider_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Requested by {connection.requested_by}
                    </p>
                  </div>
                  <StatusBadge status={connection.status} />
                </div>
                <Timeline connection={connection} />
                {connection.reason ? (
                  <p className="mt-3 text-sm text-muted-foreground">{connection.reason}</p>
                ) : null}
              </article>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={Boolean(requestTarget)}
        onOpenChange={(open) => !open && !submitting && setRequestTarget(null)}
      >
        <DialogContent>
          {requestTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Request {requestTarget.name}</DialogTitle>
                <DialogDescription>
                  The provider must approve this request before operational access becomes active.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="provider-request-note">Request note</Label>
                <Textarea
                  id="provider-request-note"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  disabled={submitting}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRequestTarget(null)} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  onClick={sendRequest}
                  disabled={submitting}
                  className="bg-emerald-800 text-white hover:bg-emerald-900"
                >
                  {submitting ? <Loader2 className="animate-spin" /> : <Link2 />}
                  Send request
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(actionTarget)}
        onOpenChange={(open) => !open && !submitting && setActionTarget(null)}
      >
        <DialogContent>
          {actionTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>{connectionLabel(actionTarget.action)}</DialogTitle>
                <DialogDescription>
                  This action is recorded in the national provider consent history.
                </DialogDescription>
              </DialogHeader>
              <Alert>
                <Network />
                <AlertTitle>{actionTarget.connection.provider_name}</AlertTitle>
                <AlertDescription>{actionTarget.connection.provider_code}</AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="connection-action-note">
                  {actionTarget.action === "approve" ? "Notes" : "Reason *"}
                </Label>
                <Textarea
                  id="connection-action-note"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  disabled={submitting}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionTarget(null)} disabled={submitting}>
                  Back
                </Button>
                <Button
                  onClick={runAction}
                  disabled={
                    submitting ||
                    (actionTarget.action !== "approve" && notes.trim().length < 3)
                  }
                  className={
                    actionTarget.action === "approve"
                      ? "bg-emerald-800 text-white hover:bg-emerald-900"
                      : "bg-red-700 text-white hover:bg-red-800"
                  }
                >
                  {submitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Confirm
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(scopeTarget)}
        onOpenChange={(open) => !open && !submitting && setScopeTarget(null)}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          {scopeTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Vehicle access for {scopeTarget.provider_name}</DialogTitle>
                <DialogDescription>
                  Removing vehicle access also ends the related provider GPS assignment.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["all", "selected"] as OwnerProviderVehicleScopeMode[]).map((mode) => (
                  <label
                    key={mode}
                    className={`cursor-pointer rounded-2xl border p-4 ${
                      scopeMode === mode ? "border-emerald-600 bg-emerald-50" : "bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="scope-mode"
                        value={mode}
                        checked={scopeMode === mode}
                        onChange={() => setScopeMode(mode)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium">
                          {mode === "all" ? "All owner vehicles" : "Selected vehicles only"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {mode === "all"
                            ? "Includes current and future vehicles."
                            : "Only checked vehicles remain accessible."}
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {scopeMode === "selected" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Select vehicles</Label>
                    <Badge variant="secondary">{selectedVehicleIds.length} selected</Badge>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border p-3">
                    {workspace.vehicles.length ? (
                      workspace.vehicles.map((vehicle) => (
                        <label
                          key={vehicle.id}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"
                        >
                          <input
                            type="checkbox"
                            checked={selectedVehicleIds.includes(vehicle.id)}
                            onChange={() => toggleVehicle(vehicle.id)}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium">
                                {vehicle.registration_number_display || vehicle.registration_number}
                              </p>
                              <StatusBadge status={vehicle.verification_status} />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[vehicle.brand, vehicle.model, vehicle.vehicle_type]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {vehicle.tracking_provider_name ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                GPS: {vehicle.tracking_provider_name} · {vehicle.tracking_assignment_status}
                              </p>
                            ) : null}
                          </div>
                        </label>
                      ))
                    ) : (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No vehicles are registered yet.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="scope-note">Change note</Label>
                <Textarea
                  id="scope-note"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  disabled={submitting}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setScopeTarget(null)} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  onClick={saveScope}
                  disabled={submitting}
                  className="bg-emerald-800 text-white hover:bg-emerald-900"
                >
                  {submitting ? <Loader2 className="animate-spin" /> : <SlidersHorizontal />}
                  Save vehicle access
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
