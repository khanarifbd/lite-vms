"use client"

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  History,
  Loader2,
  RadioTower,
  RefreshCw,
  Replace,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  ProviderDeviceAssignmentPayload,
  ProviderDeviceIdentityAvailability,
  ProviderVehicleTrackingWorkspace,
} from "@/features/provider/vehicle-tracking-types"

type AssignmentMode = "imei" | "existing"

type ProviderVehicleTrackingManagerProps = {
  vehicleId: string
  vehicleLabel: string
  vehicleVerificationStatus: string
  initialWorkspace: ProviderVehicleTrackingWorkspace
  canManage: boolean
  canConfirm: boolean
  canTest: boolean
}

const currentStatuses = new Set(["pending_provider_confirmation", "testing", "active"])
const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function statusLabel(value: string | null) {
  if (!value) return "Not available"
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "Not available" : dateTimeFormatter.format(parsed)
}

async function responseMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string; detail?: { message?: string } | string }
    | null
  if (payload?.message) return payload.message
  if (typeof payload?.detail === "string") return payload.detail
  return payload?.detail?.message || fallback
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim()
  return value || null
}

export function ProviderVehicleTrackingManager({
  vehicleId,
  vehicleLabel,
  vehicleVerificationStatus,
  initialWorkspace,
  canManage,
}: ProviderVehicleTrackingManagerProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [mode, setMode] = useState<AssignmentMode>("imei")
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const current = workspace.current_assignment
  const historyItems = useMemo(
    () => workspace.assignments.filter((item) => !currentStatuses.has(item.status)),
    [workspace.assignments]
  )

  async function reloadWorkspace(showMessage = false) {
    setPendingAction("refresh")
    setError(null)
    try {
      const response = await fetch(`/api/provider/vehicles/${vehicleId}/tracking`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to refresh GPS information."))
      }
      setWorkspace((await response.json()) as ProviderVehicleTrackingWorkspace)
      if (showMessage) setSuccess("GPS and IMEI information refreshed.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh GPS information.")
    } finally {
      setPendingAction(null)
    }
  }

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    setPendingAction("assign")
    setError(null)
    setSuccess(null)

    try {
      let payload: ProviderDeviceAssignmentPayload

      if (mode === "existing") {
        const existingDeviceId = optionalString(formData, "existing_device_id")
        if (!existingDeviceId) throw new Error("Select an available GPS device.")
        payload = {
          existing_device_id: existingDeviceId,
          account_reference: optionalString(formData, "account_reference"),
        }
      } else {
        const rawImei = String(formData.get("imei") || "").trim()
        const imei = rawImei.replace(/[\s-]/g, "")
        if (!/^\d{15}$/.test(imei)) {
          throw new Error("Enter the 15-digit IMEI printed on the GPS device.")
        }

        const identityParams = new URLSearchParams({
          device_identifier: imei,
          imei,
        })
        const identityResponse = await fetch(
          `/api/provider/vehicles/${vehicleId}/tracking/identity-check?${identityParams.toString()}`,
          { cache: "no-store" }
        )
        if (!identityResponse.ok) {
          throw new Error(await responseMessage(identityResponse, "Unable to validate this IMEI."))
        }
        const identity = (await identityResponse.json()) as ProviderDeviceIdentityAvailability
        if (!identity.available) {
          throw new Error("This IMEI is already registered or assigned to another vehicle.")
        }

        const frequency = Number.parseInt(
          String(formData.get("data_frequency_seconds") || "10"),
          10
        )
        payload = {
          imei,
          device_identifier: imei,
          manufacturer: optionalString(formData, "manufacturer"),
          model: optionalString(formData, "model"),
          protocol: optionalString(formData, "protocol"),
          firmware_version: optionalString(formData, "firmware_version"),
          sim_number: optionalString(formData, "sim_number"),
          data_frequency_seconds: Number.isFinite(frequency) ? frequency : 10,
          account_reference: optionalString(formData, "account_reference"),
        }
      }

      const response = await fetch(`/api/provider/vehicles/${vehicleId}/tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to save the GPS device."))
      }

      await reloadWorkspace()
      form.reset()
      setSuccess(
        current?.status === "active"
          ? "Replacement IMEI saved. Send the first packet from the new device, then refresh this page."
          : "IMEI saved. Send the first telemetry packet; the device will connect automatically."
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the GPS device.")
    } finally {
      setPendingAction(null)
    }
  }

  const gpsOnline =
    current?.status === "active" && current.device.operational_status === "active"

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>GPS action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>GPS information updated</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <Alert className="border-blue-200 bg-blue-50 text-blue-950">
        <Wifi />
        <AlertTitle>Fast connection flow</AlertTitle>
        <AlertDescription>
          When no device is assigned, the first valid telemetry packet can bind its IMEI automatically
          after the registration number matches this verified vehicle. You can also save an IMEI below
          before sending data. Later IMEI changes must use Replace GPS device.
        </AlertDescription>
      </Alert>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "GPS status",
            value: gpsOnline ? "Online" : current ? statusLabel(current.status) : "Waiting for first packet",
            icon: RadioTower,
          },
          {
            label: "Current IMEI",
            value: current?.device.imei || "Not assigned",
            icon: Smartphone,
          },
          {
            label: "Last packet",
            value: formatDateTime(current?.device.last_seen_at || null),
            icon: Activity,
          },
          {
            label: "Device history",
            value: workspace.history_count,
            icon: History,
          },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-3 break-words text-lg font-semibold">{value}</p>
              </div>
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                <Icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <CardTitle>Current GPS device</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Live identity, assignment status, protocol and last communication for this vehicle.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {current ? <StatusBadge status={current.status} /> : <Badge variant="outline">Not assigned</Badge>}
              <Button
                size="sm"
                variant="outline"
                disabled={pendingAction !== null}
                onClick={() => reloadWorkspace(true)}
              >
                {pendingAction === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {current ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["IMEI", current.device.imei || current.device.device_identifier],
                [
                  "Device",
                  [current.device.manufacturer, current.device.model].filter(Boolean).join(" ") ||
                    "Details not provided",
                ],
                ["Protocol", current.device.protocol || "Detected from telemetry"],
                ["SIM number", current.device.sim_number || "Not provided"],
                ["Operational status", statusLabel(current.device.operational_status)],
                ["Certification", statusLabel(current.device.certification_status)],
                ["Connected at", formatDateTime(current.provider_confirmed_at)],
                ["Last seen", formatDateTime(current.device.last_seen_at)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-2 break-words text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center">
              <RadioTower className="mx-auto size-9 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">Waiting for GPS device</h3>
              <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
                Send the first telemetry packet with registration {vehicleLabel}, or enter the device IMEI below.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle>{current ? "Replace GPS device" : "Add GPS device"}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  IMEI is the only required field. Device details are optional and can be completed later.
                </p>
              </div>
              {current ? (
                <Badge variant="secondary">
                  <Replace /> Replacement
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleAssign}>
              {workspace.available_devices.length ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={mode === "imei" ? "default" : "outline"}
                    onClick={() => setMode("imei")}
                  >
                    New IMEI
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "existing" ? "default" : "outline"}
                    onClick={() => setMode("existing")}
                  >
                    Existing device
                  </Button>
                </div>
              ) : null}

              {mode === "existing" && workspace.available_devices.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="existing_device_id">Available GPS device</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      id="existing_device_id"
                      name="existing_device_id"
                      required
                    >
                      <option value="">Select device</option>
                      {workspace.available_devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.imei || device.device_identifier}
                          {device.manufacturer ? ` · ${device.manufacturer}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="existing_account_reference">Note / reference</Label>
                    <Input id="existing_account_reference" name="account_reference" maxLength={160} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="imei">Device IMEI *</Label>
                      <Input
                        id="imei"
                        name="imei"
                        inputMode="numeric"
                        minLength={15}
                        maxLength={15}
                        pattern="[0-9]{15}"
                        placeholder="Enter 15-digit IMEI"
                        autoComplete="off"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        The IMEI will also be used as the device identifier automatically.
                      </p>
                    </div>
                  </div>

                  <details className="rounded-2xl border bg-slate-50 p-4">
                    <summary className="cursor-pointer font-medium">Optional device information</summary>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="manufacturer">Brand</Label>
                        <Input id="manufacturer" name="manufacturer" maxLength={120} placeholder="Concox" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="model">Model</Label>
                        <Input id="model" name="model" maxLength={120} placeholder="GT06N" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="protocol">Protocol</Label>
                        <Input id="protocol" name="protocol" maxLength={100} placeholder="gt06" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sim_number">SIM number</Label>
                        <Input id="sim_number" name="sim_number" maxLength={30} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="firmware_version">Firmware</Label>
                        <Input id="firmware_version" name="firmware_version" maxLength={100} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="data_frequency_seconds">Interval (seconds)</Label>
                        <Input
                          id="data_frequency_seconds"
                          name="data_frequency_seconds"
                          type="number"
                          min="5"
                          max="3600"
                          defaultValue="10"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="account_reference">Replacement reason / note</Label>
                        <Input
                          id="account_reference"
                          name="account_reference"
                          maxLength={160}
                          placeholder={current ? "Why is this device being replaced?" : "Optional"}
                        />
                      </div>
                    </div>
                  </details>
                </>
              )}

              <Button disabled={pendingAction !== null} type="submit">
                {pendingAction === "assign" ? <Loader2 className="animate-spin" /> : <RadioTower />}
                {current ? "Save replacement IMEI" : "Save IMEI"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <ShieldCheck />
          <AlertTitle>Read-only GPS access</AlertTitle>
          <AlertDescription>
            Your provider role can view GPS information but cannot add or replace devices.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Device replacement history</CardTitle>
        </CardHeader>
        <CardContent>
          {historyItems.length ? (
            <div className="space-y-3">
              {historyItems.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border bg-slate-50 p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="font-semibold">IMEI {assignment.device.imei || assignment.device.device_identifier}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(assignment.valid_from)} — {formatDateTime(assignment.valid_to)}
                    </p>
                    {assignment.rejection_reason ? (
                      <p className="mt-2 text-xs text-red-700">{assignment.rejection_reason}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={assignment.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center">
              <History className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">No device replacement history</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Replaced and ended assignments will appear here without losing tracking history.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Vehicle: {vehicleLabel} · Verification: {statusLabel(vehicleVerificationStatus)} · IMEI changes are preserved in assignment history.
      </p>
    </div>
  )
}
