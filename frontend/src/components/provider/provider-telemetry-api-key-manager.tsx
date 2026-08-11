"use client"

import {
  Ban,
  Check,
  Clipboard,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCw,
  ShieldAlert,
} from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import type {
  ProviderTelemetryApiKeyIssueResult,
  ProviderTelemetryApiKeyStatus,
} from "@/features/provider/telemetry-api-key-types"

type ProviderTelemetryApiKeyManagerProps = {
  providerId: string
  initialStatus: ProviderTelemetryApiKeyStatus
  canManage: boolean
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDateTime(value: string | null) {
  if (!value) return "Never"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "Never" : dateTimeFormatter.format(parsed)
}

async function responseMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string; detail?: string | { message?: string } }
    | null
  if (payload?.message) return payload.message
  if (typeof payload?.detail === "string") return payload.detail
  return payload?.detail?.message || fallback
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand("copy")
  document.body.removeChild(textarea)
  if (!copied) throw new Error("Copy failed")
}

function maskedKey(status: ProviderTelemetryApiKeyStatus) {
  if (!status.key_prefix || !status.key_last_four) return "No key configured"
  return `${status.key_prefix}••••••••${status.key_last_four}`
}

export function ProviderTelemetryApiKeyManager({
  providerId,
  initialStatus,
  canManage,
}: ProviderTelemetryApiKeyManagerProps) {
  const [status, setStatus] = useState(initialStatus)
  const [note, setNote] = useState("")
  const [issuedKey, setIssuedKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [pending, setPending] = useState<"refresh" | "issue" | "revoke" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function refreshStatus() {
    setPending("refresh")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/provider/telemetry-api-key/${providerId}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to refresh API key status."))
      }
      setStatus((await response.json()) as ProviderTelemetryApiKeyStatus)
      setIssuedKey(null)
      setShowKey(false)
      setSuccess("API key status refreshed.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh API key status.")
    } finally {
      setPending(null)
    }
  }

  async function issueOrRotate() {
    const reason = note.trim()
    if (reason.length < 3) {
      setError("Enter a reason of at least 3 characters before generating or rotating the key.")
      return
    }

    setPending("issue")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/provider/telemetry-api-key/${providerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: reason }),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to generate the API key."))
      }
      const result = (await response.json()) as ProviderTelemetryApiKeyIssueResult
      setStatus(result)
      setIssuedKey(result.api_key)
      setShowKey(true)
      setNote("")
      setSuccess(
        status.configured
          ? "The API key was rotated. The previous key is no longer valid."
          : "The API key was generated successfully."
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate the API key.")
    } finally {
      setPending(null)
    }
  }

  async function revokeKey() {
    const reason = note.trim()
    if (reason.length < 3) {
      setError("Enter a revocation reason of at least 3 characters.")
      return
    }
    if (!window.confirm("Revoke this API key? Provider telemetry will stop immediately.")) {
      return
    }

    setPending("revoke")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/provider/telemetry-api-key/${providerId}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: reason }),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to revoke the API key."))
      }
      setStatus((await response.json()) as ProviderTelemetryApiKeyStatus)
      setIssuedKey(null)
      setShowKey(false)
      setNote("")
      setSuccess("The API key was revoked. Telemetry requests using it will now be rejected.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to revoke the API key.")
    } finally {
      setPending(null)
    }
  }

  async function copyIssuedKey() {
    if (!issuedKey) return
    try {
      await copyText(issuedKey)
      setSuccess("API key copied. Store it in the provider server secret manager now.")
      setError(null)
    } catch {
      setError("Automatic copy is unavailable. Select and copy the displayed key manually.")
    }
  }

  const active = status.configured && !status.revoked_at

  return (
    <Card className="overflow-hidden border-emerald-200">
      <CardHeader className="border-b bg-emerald-50/70">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="size-5 text-emerald-700" />
              <CardTitle>Telemetry API key</CardTitle>
              <Badge variant={active ? "default" : "secondary"}>
                {active ? "Active" : status.revoked_at ? "Revoked" : "Not configured"}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Authenticate every telemetry request with this provider-specific credential. The full
              secret is shown only once when generated or rotated.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshStatus} disabled={pending !== null}>
            {pending === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5 sm:p-6">
        {error ? (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>API key action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {success ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
            <Check />
            <AlertTitle>API key workspace updated</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}

        {issuedKey ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <KeyRound />
            <AlertTitle>Copy this key now — it will not be shown again</AlertTitle>
            <AlertDescription className="mt-3 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 break-all rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
                  {showKey ? issuedKey : "•".repeat(Math.min(issuedKey.length, 48))}
                </code>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowKey((value) => !value)}>
                    {showKey ? <EyeOff /> : <Eye />}
                    {showKey ? "Hide" : "Show"}
                  </Button>
                  <Button type="button" size="sm" onClick={copyIssuedKey}>
                    <Clipboard /> Copy key
                  </Button>
                </div>
              </div>
              <p className="text-xs">
                Store it as a server secret. Do not place it in mobile apps, browser code, screenshots,
                source control, or support messages.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Credential", maskedKey(status)],
            ["Telemetry source", status.source_code || "Not created"],
            ["Last authenticated", formatDateTime(status.last_authenticated_at)],
            ["Last rotated", formatDateTime(status.rotated_at)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-2 break-all text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border p-4">
            <p className="text-sm font-semibold">Request authentication</p>
            <div className="mt-3 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
              <pre>{`${status.header_name}: YOUR_PROVIDER_API_KEY\nContent-Type: application/json\nPOST ${status.ingestion_path}`}</pre>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border p-4">
            <div>
              <Label htmlFor="api-key-change-note">Change reason</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Required for key generation, rotation, and revocation. The reason is written to the audit log.
              </p>
            </div>
            <textarea
              id="api-key-change-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Example: Initial production integration credential"
              rows={3}
              maxLength={1000}
              disabled={!canManage || pending !== null}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />

            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={issueOrRotate} disabled={pending !== null}>
                  {pending === "issue" ? (
                    <Loader2 className="animate-spin" />
                  ) : active ? (
                    <RotateCw />
                  ) : (
                    <KeyRound />
                  )}
                  {active ? "Rotate API key" : "Generate API key"}
                </Button>
                {active ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={revokeKey}
                    disabled={pending !== null}
                  >
                    {pending === "revoke" ? <Loader2 className="animate-spin" /> : <Ban />}
                    Revoke key
                  </Button>
                ) : null}
              </div>
            ) : (
              <Alert>
                <ShieldAlert />
                <AlertTitle>Read-only access</AlertTitle>
                <AlertDescription>
                  Only a VTS Admin or VTS Technical user can generate, rotate, or revoke the telemetry API key.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
