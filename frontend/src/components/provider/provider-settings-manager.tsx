"use client"

import {
  Building2,
  CheckCircle2,
  CircleUserRound,
  ContactRound,
  Loader2,
  LockKeyhole,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

import { ChangePasswordForm } from "@/components/auth/change-password-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ProviderApplication } from "@/features/provider/types"
import type { AuthUser } from "@/lib/auth/types"
import { cn } from "@/lib/utils"

type SettingsTab = "account" | "organization" | "contacts" | "security"

type ProviderSettingsManagerProps = {
  user: AuthUser
  provider: ProviderApplication
  canManageProvider: boolean
  initialTab: SettingsTab
}

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Settings2 }> = [
  { id: "account", label: "My account", icon: CircleUserRound },
  { id: "organization", label: "Provider settings", icon: Building2 },
  { id: "contacts", label: "Operational contacts", icon: ContactRound },
  { id: "security", label: "Security", icon: LockKeyhole },
]

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
  const payload = (await response.json().catch(() => null)) as { message?: string } | null
  return payload?.message || fallback
}

function FormField({
  id,
  label,
  defaultValue,
  type = "text",
  placeholder,
  disabled,
}: {
  id: string
  label: string
  defaultValue?: string | number | null
  type?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}

function TextAreaField({
  id,
  label,
  defaultValue,
  placeholder,
  disabled,
  rows = 4,
}: {
  id: string
  label: string
  defaultValue?: string | null
  placeholder?: string
  disabled?: boolean
  rows?: number
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={id}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}

export function ProviderSettingsManager({
  user,
  provider,
  canManageProvider,
  initialTab,
}: ProviderSettingsManagerProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function patch(path: string, payload: Record<string, unknown>, action: string) {
    setPending(action)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await responseMessage(response, "Unable to save settings."))
      setSuccess("Settings saved successfully.")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save settings.")
    } finally {
      setPending(null)
    }
  }

  async function handleAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    await patch(
      "/api/provider/account",
      {
        display_name: String(formData.get("display_name") || "").trim(),
        preferred_language: String(formData.get("preferred_language") || "en"),
        timezone: String(formData.get("timezone") || "Asia/Dhaka"),
      },
      "account"
    )
  }

  async function handleOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const interval = Number(formData.get("data_submission_interval_seconds") || 10)
    await patch(
      "/api/provider/settings",
      {
        website_url: String(formData.get("website_url") || "").trim() || null,
        current_platform_name: String(formData.get("current_platform_name") || "").trim() || null,
        api_base_url: String(formData.get("api_base_url") || "").trim() || null,
        data_submission_interval_seconds: Number.isFinite(interval) ? interval : 10,
        service_coverage: parseList(formData.get("service_coverage")),
        supported_protocols: parseList(formData.get("supported_protocols")),
        supported_device_brands: parseList(formData.get("supported_device_brands")),
        allowed_server_ips: parseList(formData.get("allowed_server_ips")),
      },
      "organization"
    )
  }

  async function handleContacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const optional = (name: string) => String(formData.get(name) || "").trim() || null
    await patch(
      "/api/provider/settings",
      {
        technical_contact_name: optional("technical_contact_name"),
        technical_contact_email: optional("technical_contact_email"),
        technical_contact_mobile: optional("technical_contact_mobile"),
        operations_contact_name: optional("operations_contact_name"),
        operations_contact_phone: optional("operations_contact_phone"),
        operations_contact_email: optional("operations_contact_email"),
        support_contact_name: optional("support_contact_name"),
        support_contact_phone: optional("support_contact_phone"),
        support_contact_email: optional("support_contact_email"),
        emergency_contact_name: optional("emergency_contact_name"),
        emergency_contact_phone: optional("emergency_contact_phone"),
        emergency_contact_email: optional("emergency_contact_email"),
      },
      "contacts"
    )
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <Settings2 />
          <AlertTitle>Unable to save settings</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>Settings updated</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Settings sections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                  activeTab === id
                    ? "bg-emerald-950 text-white"
                    : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </CardContent>
        </Card>

        <div>
          {activeTab === "account" ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>My account</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Update the name and localization preferences used across the provider workspace.
                    </p>
                  </div>
                  <Badge variant="outline">{user.primary_role || "Provider user"}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={handleAccount}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField id="display_name" label="Display name" defaultValue={user.display_name} />
                    <FormField id="email" label="Email" defaultValue={user.email} disabled />
                    <div className="space-y-2">
                      <Label htmlFor="preferred_language">Preferred language</Label>
                      <select
                        id="preferred_language"
                        name="preferred_language"
                        defaultValue={user.preferred_language || "en"}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="en">English</option>
                        <option value="bn">বাংলা</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <select
                        id="timezone"
                        name="timezone"
                        defaultValue={user.timezone || "Asia/Dhaka"}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="Asia/Dhaka">Asia/Dhaka (UTC+6)</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                  </div>
                  <Button type="submit" disabled={pending !== null}>
                    {pending === "account" ? <Loader2 className="animate-spin" /> : <Save />}
                    Save account
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "organization" ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Provider and integration settings</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Maintain the operational platform, service coverage, protocols, and gateway network details.
                    </p>
                  </div>
                  <Badge variant={canManageProvider ? "default" : "secondary"}>
                    {canManageProvider ? "Admin access" : "Read only"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={handleOrganization}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField id="legal_name" label="Legal company name" defaultValue={provider.legal_name} disabled />
                    <FormField id="provider_code" label="Provider code" defaultValue={provider.code} disabled />
                    <FormField
                      id="website_url"
                      label="Website"
                      defaultValue={provider.website_url}
                      placeholder="https://provider.example.com"
                      disabled={!canManageProvider}
                    />
                    <FormField
                      id="current_platform_name"
                      label="Current tracking platform"
                      defaultValue={provider.current_platform_name}
                      disabled={!canManageProvider}
                    />
                    <FormField
                      id="api_base_url"
                      label="Provider API base URL"
                      defaultValue={provider.api_base_url}
                      placeholder="https://api.provider.example.com"
                      disabled={!canManageProvider}
                    />
                    <FormField
                      id="data_submission_interval_seconds"
                      label="Telemetry interval (seconds)"
                      type="number"
                      defaultValue={provider.data_submission_interval_seconds || 10}
                      disabled={!canManageProvider}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextAreaField
                      id="service_coverage"
                      label="Service coverage"
                      defaultValue={listText(provider.service_coverage)}
                      placeholder="Dhaka\nChattogram"
                      disabled={!canManageProvider}
                    />
                    <TextAreaField
                      id="supported_protocols"
                      label="Supported GPS protocols"
                      defaultValue={listText(provider.supported_protocols)}
                      placeholder="GT06\nJT808\nTeltonika"
                      disabled={!canManageProvider}
                    />
                    <TextAreaField
                      id="supported_device_brands"
                      label="Supported device brands"
                      defaultValue={listText(provider.supported_device_brands)}
                      placeholder="Concox\nTeltonika"
                      disabled={!canManageProvider}
                    />
                    <TextAreaField
                      id="allowed_server_ips"
                      label="Provider server IP addresses"
                      defaultValue={listText(provider.allowed_server_ips)}
                      placeholder="203.0.113.10\n203.0.113.11"
                      disabled={!canManageProvider}
                    />
                  </div>
                  {canManageProvider ? (
                    <Button type="submit" disabled={pending !== null}>
                      {pending === "organization" ? <Loader2 className="animate-spin" /> : <Save />}
                      Save provider settings
                    </Button>
                  ) : (
                    <Alert>
                      <ShieldCheck />
                      <AlertTitle>Read-only settings</AlertTitle>
                      <AlertDescription>Only a VTS Admin can update provider operational settings.</AlertDescription>
                    </Alert>
                  )}
                </form>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "contacts" ? (
            <Card>
              <CardHeader>
                <CardTitle>Operational contacts</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Bangladesh Police uses these contacts for technical incidents, operations, support, and emergencies.
                </p>
              </CardHeader>
              <CardContent>
                <form className="space-y-6" onSubmit={handleContacts}>
                  {[
                    ["Technical", "technical", provider.technical_contact_name, provider.technical_contact_phone, provider.technical_contact_email],
                    ["Operations", "operations", provider.operations_contact_name, provider.operations_contact_phone, provider.operations_contact_email],
                    ["Support", "support", provider.support_contact_name, provider.support_contact_phone, provider.support_contact_email],
                    ["Emergency", "emergency", provider.emergency_contact_name, provider.emergency_contact_phone, provider.emergency_contact_email],
                  ].map(([title, prefix, name, phone, email]) => (
                    <section key={String(prefix)} className="rounded-2xl border p-4">
                      <h3 className="font-semibold">{title} contact</h3>
                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <FormField id={`${prefix}_contact_name`} label="Name" defaultValue={name} disabled={!canManageProvider} />
                        <FormField id={`${prefix}_contact_phone`} label="Mobile" defaultValue={phone} disabled={!canManageProvider} />
                        <FormField id={`${prefix}_contact_email`} label="Email" type="email" defaultValue={email} disabled={!canManageProvider} />
                      </div>
                    </section>
                  ))}
                  {canManageProvider ? (
                    <Button type="submit" disabled={pending !== null}>
                      {pending === "contacts" ? <Loader2 className="animate-spin" /> : <Save />}
                      Save contacts
                    </Button>
                  ) : null}
                </form>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "security" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Change password</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    A password change revokes every active session and returns you to sign in.
                  </p>
                </CardHeader>
                <CardContent>
                  <ChangePasswordForm />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Account security</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <p className="text-muted-foreground">Identity verification</p>
                    <p className="mt-2 font-semibold">{user.identity_verification_status}</p>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <p className="text-muted-foreground">Email verification</p>
                    <p className="mt-2 font-semibold">{user.email_verified ? "Verified" : "Pending"}</p>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <p className="text-muted-foreground">Last login</p>
                    <p className="mt-2 font-semibold">{user.last_login_at ? new Date(user.last_login_at).toLocaleString("en-BD") : "Not available"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
