"use client"

import {
  CheckCircle2,
  CircleUserRound,
  FileUser,
  Loader2,
  LockKeyhole,
  Save,
  Settings2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

import { ChangePasswordForm } from "@/components/auth/change-password-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { OwnerApplication } from "@/features/owner/types"
import type { AuthUser } from "@/lib/auth/types"
import { cn } from "@/lib/utils"

type SettingsTab = "account" | "profile" | "security"

type Props = {
  user: AuthUser
  owner: OwnerApplication
  initialTab: SettingsTab
}

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Settings2 }> = [
  { id: "account", label: "My account", icon: CircleUserRound },
  { id: "profile", label: "Owner profile", icon: FileUser },
  { id: "security", label: "Security", icon: LockKeyhole },
]

async function responseMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null
  return payload?.message || fallback
}

export function OwnerSettingsManager({ user, owner, initialTab }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/owner/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: String(formData.get("display_name") || "").trim(),
          preferred_language: String(formData.get("preferred_language") || "en"),
          timezone: String(formData.get("timezone") || "Asia/Dhaka"),
        }),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to save account settings."))
      }
      setSuccess("Account settings saved successfully.")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save account settings.")
    } finally {
      setPending(false)
    }
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
          <CardHeader><CardTitle className="text-base">Settings sections</CardTitle></CardHeader>
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
                <Icon className="size-4" /> {label}
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
                      Update the display name and localization preferences used across the owner portal.
                    </p>
                  </div>
                  <Badge variant="outline">Vehicle owner</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={handleAccount}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="display_name">Display name</Label>
                      <Input id="display_name" name="display_name" defaultValue={user.display_name} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" defaultValue={user.email || ""} disabled />
                    </div>
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
                  <Button type="submit" disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : <Save />} Save account
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "profile" ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Verified owner profile</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Identity, address, company information, and owner documents are maintained in the dedicated profile workspace.
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {owner.verification_status.replaceAll("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner name</p>
                    <p className="mt-2 font-semibold">{owner.owner_name}</p>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner code</p>
                    <p className="mt-2 font-semibold">{owner.owner_code || "Pending"}</p>
                  </div>
                </div>
                <Button asChild className="bg-emerald-800 text-white hover:bg-emerald-900">
                  <Link href="/owner/profile"><FileUser /> Open owner profile</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "security" ? (
            <Card>
              <CardHeader>
                <CardTitle>Account security</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Changing your password signs out the current session and requires a fresh login.
                </p>
              </CardHeader>
              <CardContent className="max-w-xl">
                <ChangePasswordForm />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
