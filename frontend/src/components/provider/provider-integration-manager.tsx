"use client"

import {
  Activity,
  CheckCircle2,
  Clipboard,
  Clock3,
  Cpu,
  Loader2,
  Network,
  RadioTower,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  Wifi,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, useMemo, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ProviderApplication } from "@/features/provider/types"

type ProviderIntegrationManagerProps = {
  initialProvider: ProviderApplication
  canManage: boolean
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDateTime(value: string | null) {
  if (!value) return "No packet received"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "No packet received" : dateTimeFormatter.format(parsed)
}

function listText(values: string[]) {
  return values.join("\n")
}

function parseList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function responseMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string; detail?: string | { message?: string } }
    | null
  if (payload?.message) return payload.message
  if (typeof payload?.detail === "string") return payload.detail
  return payload?.detail?.message || fallback
}

export function ProviderIntegrationManager({
  initialProvider,
  canManage,
}: ProviderIntegrationManagerProps) {
  const router = useRouter()
  const [provider, setProvider] = useState(initialProvider)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const samplePayload = useMemo(
    () =>
      JSON.stringify(
        {
          packets: [
            {
              registration_number: "DHAKA-METRO-GA-11-1234",
              imei: "123456789012345",
              op: "loc",
              dt_tracker: new Date().toISOString(),
              dt_provider_received: new Date().toISOString(),
              lat: 23.8103,
              lng: 90.4125,
              speed: 35.5,
              angle: 180,
              altitude: 12,
              loc_valid: true,
              params: {
                ignition: true,
                battery_voltage: 12.6,
                satellites: 12,
              },
              protocol: "gt06",
              net_protocol: "tcp",
              ip: "127.0.0.1",
              port: 5023,
              event: "position",
            },
          ],
        },
        null,
        2
      ),
    []
  )

  const connected = provider.integration_status === "connected"
  const configured = Boolean(provider.telemetry_source_code)

  async function refreshStatus() {
    setPending("refresh")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/provider/integration", { cache: "no-store" })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to refresh integration status."))
      }
      setProvider((await response.json()) as ProviderApplication)
      setSuccess("Integration status refreshed.")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh integration status.")
    } finally {
      setPending(null)
    }
  }

  async function handleSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const interval = Number(formData.get("data_submission_interval_seconds") || 10)
    setPending("save")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/provider/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_base_url: String(formData.get("api_base_url") || "").trim() || null,
          current_platform_name:
            String(formData.get("current_platform_name") || "").trim() || null,
          data_submission_interval_seconds: Number.isFinite(interval) ? interval : 10,
          supported_protocols: parseList(formData.get("supported_protocols")),
          supported_device_brands: parseList(formData.get("supported_device_brands")),
          allowed_server_ips: parseList(formData.get("allowed_server_ips")),
        }),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to save integration settings."))
      }
      setProvider((await response.json()) as ProviderApplication)
      setSuccess("Telemetry integration settings saved.")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save integration settings.")
    } finally {
      setPending(null)
    }
  }

  async function copySample() {
    try {
      await navigator.clipboard.writeText(samplePayload)
      setSuccess("Current batch telemetry payload copied.")
      setError(null)
    } catch {
      setError("The sample payload could not be copied in this browser.")
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <RadioTower />
          <AlertTitle>Telemetry integration action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>Integration workspace updated</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Integration status",
            value: connected ? "Connected" : configured ? "Ready" : "Preparing",
            icon: Wifi,
          },
          {
            label: "Telemetry source",
            value: provider.telemetry_source_code || "Creating source",
            icon: RadioTower,
          },
          {
            label: "Last packet",
            value: formatDateTime(provider.last_telemetry_received_at),
            icon: Clock3,
          },
          {
            label: "Active vehicles",
            value: provider.active_vehicle_count,
            icon: Activity,
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

      <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
        <Cpu />
        <AlertTitle>First packet can connect the GPS automatically</AlertTitle>
        <AlertDescription>
          For a verified vehicle with no current GPS assignment, send its registration number and IMEI.
          The platform creates the device, binds it to the vehicle and accepts the packet automatically.
          Later IMEI changes must be completed from the vehicle&apos;s Replace GPS device screen.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle>National telemetry endpoint</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Send one to 500 location or heartbeat packets in one request.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshStatus}
                disabled={pending !== null}
              >
                {pending === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Method and path</p>
                <p className="mt-2 break-all font-mono text-sm font-semibold">
                  POST /api/v1/telemetry
                </p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Authentication</p>
                <p className="mt-2 text-sm font-semibold">Provider-specific X-API-Key</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Generate or rotate the credential from the secure API key card above.
                </p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Vehicle matching</p>
                <p className="mt-2 text-sm font-semibold">Registration number + IMEI</p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Recommended interval</p>
                <p className="mt-2 text-sm font-semibold">
                  Every {provider.data_submission_interval_seconds || 10} seconds
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-slate-950 text-slate-100">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <p className="text-sm font-medium">Current batch JSON payload</p>
                <Button size="sm" variant="secondary" onClick={copySample}>
                  <Clipboard /> Copy
                </Button>
              </div>
              <pre className="max-h-[520px] overflow-auto p-4 text-xs leading-6">{samplePayload}</pre>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["1", "Generate and securely store the API key"],
                ["2", "Send X-API-Key, registration and IMEI"],
                ["3", "Refresh vehicle GPS status"],
              ].map(([step, label]) => (
                <div key={step} className="rounded-2xl border p-4">
                  <Badge>{step}</Badge>
                  <p className="mt-3 text-sm font-medium">{label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Optional integration profile</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  These details support technical operations and audits. They are not required for the
                  first telemetry connection.
                </p>
              </div>
              <Badge variant={canManage ? "default" : "secondary"}>
                {canManage ? "Admin" : "Read only"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSettings}>
              <div className="space-y-2">
                <Label htmlFor="current_platform_name">Tracking platform name</Label>
                <Input
                  id="current_platform_name"
                  name="current_platform_name"
                  defaultValue={provider.current_platform_name || ""}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api_base_url">Provider API base URL</Label>
                <Input
                  id="api_base_url"
                  name="api_base_url"
                  defaultValue={provider.api_base_url || ""}
                  placeholder="https://api.provider.example.com"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_submission_interval_seconds">Data interval (seconds)</Label>
                <Input
                  id="data_submission_interval_seconds"
                  name="data_submission_interval_seconds"
                  type="number"
                  min="1"
                  max="3600"
                  defaultValue={provider.data_submission_interval_seconds || 10}
                  disabled={!canManage}
                />
              </div>
              {[
                [
                  "supported_protocols",
                  "Supported protocols",
                  provider.supported_protocols,
                  "GT06\nJT808\nTeltonika",
                ],
                [
                  "supported_device_brands",
                  "Device brands",
                  provider.supported_device_brands,
                  "Concox\nTeltonika",
                ],
                [
                  "allowed_server_ips",
                  "Provider server IPs",
                  provider.allowed_server_ips,
                  "203.0.113.10",
                ],
              ].map(([id, label, values, placeholder]) => (
                <div key={String(id)} className="space-y-2">
                  <Label htmlFor={String(id)}>{String(label)}</Label>
                  <textarea
                    id={String(id)}
                    name={String(id)}
                    defaultValue={listText(values as string[])}
                    placeholder={String(placeholder)}
                    disabled={!canManage}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              ))}
              {canManage ? (
                <Button type="submit" disabled={pending !== null}>
                  {pending === "save" ? <Loader2 className="animate-spin" /> : <Save />}
                  Save optional profile
                </Button>
              ) : (
                <Alert>
                  <ShieldCheck />
                  <AlertTitle>Read-only integration access</AlertTitle>
                  <AlertDescription>
                    Only a VTS Admin can change the optional integration profile.
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection readiness</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            [provider.telemetry_source_code, "Telemetry source ready", RadioTower],
            [true, "Batch endpoint available", ServerCog],
            [provider.allowed_server_ips.length > 0, "Server IP profile", Network],
            [provider.last_telemetry_received_at, "At least one request received", Wifi],
          ].map(([ready, label, Icon], index) => {
            const StatusIcon = Icon as typeof RadioTower
            return (
              <div key={index} className="flex items-center gap-3 rounded-2xl border bg-slate-50 p-4">
                <div
                  className={`flex size-10 items-center justify-center rounded-xl ${
                    ready
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  <StatusIcon className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{String(label)}</p>
                  <p className="text-xs text-muted-foreground">
                    {ready ? "Complete" : index === 2 ? "Optional" : "Waiting"}
                  </p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
