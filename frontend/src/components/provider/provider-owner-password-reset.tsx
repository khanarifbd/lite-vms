"use client"

import { CheckCircle2, Copy, KeyRound, Loader2, ShieldAlert } from "lucide-react"
import { type FormEvent, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

function secureTemporaryPassword() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("")
}

export function ProviderOwnerPasswordReset({
  ownerId,
  ownerName,
}: {
  ownerId: string
  ownerName: string
}) {
  const [verified, setVerified] = useState(false)
  const [reason, setReason] = useState("")
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!verified || reason.trim().length < 10) {
      setError("Verify the account holder and enter a reason (at least 10 characters).")
      return
    }
    if (!window.confirm(`Reset the global login password for ${ownerName}? All active sessions will be revoked.`)) return
    const newPassword = secureTemporaryPassword()
    setPending(true)
    setError(null)
    setIssuedPassword(null)
    try {
      const response = await fetch(`/api/provider/owners/${encodeURIComponent(ownerId)}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ new_password: newPassword, reason: reason.trim() }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
        throw new Error(data?.message || data?.detail || "Unable to reset owner password.")
      }
      setIssuedPassword(newPassword)
      setReason("")
      setVerified(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reset owner password.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-emerald-800" /> Owner account support</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">Reset only after verifying the owner's identity. This changes the owner's shared login across the platform, revokes existing sessions, and requires a new password at the next login.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive"><ShieldAlert /><AlertTitle>Password reset failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {issuedPassword ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
            <CheckCircle2 /><AlertTitle>Temporary password issued</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>This temporary password is shown only on this screen. Share it with the verified owner through a private channel, not a public message.</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded-md border bg-white px-3 py-2 text-base font-semibold">{issuedPassword}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(issuedPassword)}><Copy className="size-4" /> Copy</Button>
              </div>
              <p>The old password and existing sessions no longer work. A password change is required on the next login.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setIssuedPassword(null)}>Hide temporary password</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={(event) => void reset(event)} className="space-y-3">
          <label className="flex items-start gap-2 text-sm leading-6">
            <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-1 size-4" required />
            I have verified the owner using their registered contact details and confirmed they requested account recovery.
          </label>
          <div className="space-y-2">
            <Label htmlFor="owner-reset-reason">Support reason *</Label>
            <Textarea id="owner-reset-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} rows={3} required placeholder="How did you verify the account holder and confirm this request?" />
          </div>
          <Button type="submit" disabled={pending || !verified || reason.trim().length < 10 || Boolean(issuedPassword)} variant="outline" className="border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Issue temporary password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
