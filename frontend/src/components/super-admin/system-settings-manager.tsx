"use client"

import {
  BellRing,
  CheckCircle2,
  FileCheck2,
  Loader2,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  TimerReset,
} from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AuditLogItem, SystemSettings } from "@/features/super-admin/settings"

type BooleanGroup = "approval" | "notifications" | "security"

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  danger = false,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  danger?: boolean
}) {
  const activeClass = danger ? "bg-rose-600" : "bg-emerald-700"
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border bg-white p-4 transition hover:border-emerald-300">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${checked ? activeClass : "bg-slate-200"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  )
}

function AuditItem({ item }: { item: AuditLogItem }) {
  const date = new Date(item.created_at)
  return (
    <article className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{label(item.action)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {label(item.resource_type)} · {item.actor_name || "System"}
          </p>
        </div>
        <Badge variant="outline">{date.toLocaleString("en-BD")}</Badge>
      </div>
      {item.reason ? <p className="mt-3 text-sm text-amber-800">{item.reason}</p> : null}
    </article>
  )
}

export function SystemSettingsManager({
  initialSettings,
  auditLogs,
}: {
  initialSettings: SystemSettings
  auditLogs: AuditLogItem[]
}) {
  const [settings, setSettings] = useState<SystemSettings>(() => ({
    ...initialSettings,
    monitoring: initialSettings.monitoring ?? { live_map_refresh_seconds: 30 },
  }))
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function setBoolean(group: BooleanGroup, key: string, value: boolean) {
    setSettings((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [key]: value,
      },
    }))
  }

  async function saveSettings() {
    const refreshSeconds = Number(settings.monitoring.live_map_refresh_seconds)
    if (!Number.isInteger(refreshSeconds) || refreshSeconds < 15 || refreshSeconds > 3600) {
      setError("Live map refresh interval must be between 15 and 3600 seconds.")
      return
    }
    if (reason.trim().length < 3) {
      setError("Enter a reason before saving system settings.")
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/super-admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, reason: reason.trim(), updated_at: undefined }),
      })
      const body = (await response.json().catch(() => null)) as SystemSettings & { message?: string }
      if (!response.ok) throw new Error(body?.message || "Unable to save settings.")
      setSettings(body)
      setReason("")
      setSuccess("System settings saved and audit history recorded.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save settings.")
    } finally {
      setSaving(false)
    }
  }

  const approvalItems = [
    ["provider_auto_approve", "Auto-approve VTS providers", "New provider applications will be approved immediately after configured required documents are present."],
    ["owner_auto_approve", "Auto-approve vehicle owners", "Individual and company owner applications will be approved when profile, declaration, and required documents are complete."],
    ["vehicle_auto_approve", "Auto-approve vehicles", "Submitted vehicles will be police-verified automatically after required documents are present."],
    ["driver_auto_approve", "Auto-approve drivers", "Complete driver applications will be verified automatically only after NID, declaration, valid BRTA licence, vehicle classes, and required driver documents are present."],
    ["provider_staff_auto_approve", "Auto-approve provider staff", "New provider staff memberships can become active without Police review."],
    ["gps_assignment_auto_approve", "Auto-approve GPS assignments", "New primary GPS assignments can become active after provider confirmation."],
    ["document_auto_verify", "Auto-verify documents", "Documents associated with an automatically approved entity will be marked verified/valid."],
  ] as const

  const notificationItems = [
    ["provider_application_submitted", "Provider application submitted"],
    ["owner_application_submitted", "Owner application submitted"],
    ["vehicle_application_submitted", "Vehicle application submitted"],
    ["approval_decision", "Approval decision notifications"],
    ["gps_offline_alert", "GPS offline alerts"],
    ["document_expiry_alert", "Document expiry alerts"],
    ["violation_alert", "Violation alerts"],
  ] as const

  return (
    <div className="space-y-6">
      {error ? <Alert variant="destructive"><Settings2 /><AlertTitle>Unable to save</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {success ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 /><AlertTitle>Settings updated</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><SlidersHorizontal className="size-5" /></div>
            <div><CardTitle>Approval automation</CardTitle><p className="mt-1 text-sm text-muted-foreground">All automatic approvals are disabled by default. Turning on a rule affects future completed submissions only.</p></div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {approvalItems.map(([key, title, description]) => (
            <ToggleRow
              key={key}
              title={title}
              description={description}
              checked={settings.approval[key]}
              onChange={(value) => setBoolean("approval", key, value)}
              danger={key.includes("auto_approve")}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800"><TimerReset className="size-5" /></div>
            <div>
              <CardTitle>Live monitoring refresh</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Control how often the national live tracking map requests the latest vehicle data.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 rounded-2xl border bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
            <div>
              <p className="font-medium">Live map refresh interval</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">The map countdown and automatic refresh use this interval. Minimum 15 seconds; maximum 3600 seconds.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="live-map-refresh-seconds">Seconds</Label>
              <Input
                id="live-map-refresh-seconds"
                type="number"
                min={15}
                max={3600}
                step={1}
                value={settings.monitoring.live_map_refresh_seconds}
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  monitoring: {
                    ...current.monitoring,
                    live_map_refresh_seconds: Number(event.target.value),
                  },
                }))}
              />
              <p className="text-[11px] text-muted-foreground">Recommended: 30 seconds for normal national monitoring.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><div className="flex items-center gap-3"><BellRing className="size-5 text-emerald-700" /><CardTitle>Notification rules</CardTitle></div></CardHeader>
          <CardContent className="space-y-3">
            {notificationItems.map(([key, title]) => <ToggleRow key={key} title={title} description={`Send or create ${title.toLowerCase()} events.`} checked={Boolean(settings.notifications[key])} onChange={(value) => setBoolean("notifications", key, value)} />)}
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>GPS offline after minutes</Label><Input type="number" min={1} max={1440} value={settings.notifications.gps_offline_minutes} onChange={(event) => setSettings((current) => ({ ...current, notifications: { ...current.notifications, gps_offline_minutes: Number(event.target.value) } }))} /></div>
              <div className="space-y-2"><Label>Document warning days</Label><Input type="number" min={1} max={365} value={settings.notifications.document_expiry_warning_days} onChange={(event) => setSettings((current) => ({ ...current, notifications: { ...current.notifications, document_expiry_warning_days: Number(event.target.value) } }))} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div className="flex items-center gap-3"><ShieldCheck className="size-5 text-emerald-700" /><CardTitle>Security & account policy</CardTitle></div></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2"><Label>Session timeout</Label><Input type="number" value={settings.security.session_timeout_minutes} onChange={(event) => setSettings((current) => ({ ...current, security: { ...current.security, session_timeout_minutes: Number(event.target.value) } }))} /></div>
              <div className="space-y-2"><Label>Failed login limit</Label><Input type="number" value={settings.security.maximum_failed_login_attempts} onChange={(event) => setSettings((current) => ({ ...current, security: { ...current.security, maximum_failed_login_attempts: Number(event.target.value) } }))} /></div>
              <div className="space-y-2"><Label>Account lock minutes</Label><Input type="number" value={settings.security.account_lock_minutes} onChange={(event) => setSettings((current) => ({ ...current, security: { ...current.security, account_lock_minutes: Number(event.target.value) } }))} /></div>
            </div>
            <ToggleRow title="Require first-login password change" description="New platform staff must replace their temporary password." checked={settings.security.require_password_change_for_new_staff} onChange={(value) => setBoolean("security", "require_password_change_for_new_staff", value)} />
            <ToggleRow title="Require verified admin identifier" description="Administrative users must maintain a verified login identifier." checked={settings.security.require_verified_identifier_for_admin} onChange={(value) => setBoolean("security", "require_verified_identifier_for_admin", value)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><div className="flex items-center gap-3"><FileCheck2 className="size-5 text-emerald-700" /><CardTitle>Document requirements</CardTitle></div></CardHeader>
          <CardContent className="space-y-3">
            {settings.document_requirements.map((item, index) => <div key={`${item.entity_type}-${item.code}-${index}`} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto_auto]"><Input value={item.label} onChange={(event) => setSettings((current) => ({ ...current, document_requirements: current.document_requirements.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row) }))} /><Badge variant="outline" className="h-9 justify-center">{label(item.entity_type)}</Badge><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.required} onChange={(event) => setSettings((current) => ({ ...current, document_requirements: current.document_requirements.map((row, rowIndex) => rowIndex === index ? { ...row, required: event.target.checked } : row) }))} />Required</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.expiry_required} onChange={(event) => setSettings((current) => ({ ...current, document_requirements: current.document_requirements.map((row, rowIndex) => rowIndex === index ? { ...row, expiry_required: event.target.checked } : row) }))} />Expiry</label></div>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div className="flex items-center gap-3"><Tags className="size-5 text-emerald-700" /><CardTitle>Vehicle categories</CardTitle></div></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {settings.vehicle_categories.map((item, index) => <label key={item.code} className="flex items-center justify-between gap-3 rounded-2xl border p-4"><div><p className="font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.code}</p></div><input type="checkbox" checked={item.enabled} onChange={(event) => setSettings((current) => ({ ...current, vehicle_categories: current.vehicle_categories.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: event.target.checked } : row) }))} /></label>)}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle>Save configuration</CardTitle><p className="text-sm text-muted-foreground">A reason is mandatory and will be stored in the immutable audit trail.</p></CardHeader>
        <CardContent className="space-y-4"><div className="space-y-2"><Label>Administrative reason</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="Explain why these platform settings are changing." /></div><Button type="button" className="bg-emerald-800 text-white hover:bg-emerald-900" disabled={saving} onClick={() => void saveSettings()}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save all settings</Button></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent audit logs</CardTitle><p className="text-sm text-muted-foreground">Latest system, approval, account, provider, owner, vehicle, and driver actions.</p></CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">{auditLogs.length ? auditLogs.map((item) => <AuditItem key={item.id} item={item} />) : <p className="text-sm text-muted-foreground">No audit events found.</p>}</CardContent>
      </Card>
    </div>
  )
}
