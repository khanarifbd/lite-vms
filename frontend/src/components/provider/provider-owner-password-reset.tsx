"use client"

import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldAlert } from "lucide-react"
import { type FormEvent, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function ProviderOwnerPasswordReset({
  ownerId,
  ownerName,
}: {
  ownerId: string
  ownerName: string
}) {
  const [verified, setVerified] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [visible, setVisible] = useState(false)
  const [reason, setReason] = useState("")
  const [completed, setCompleted] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!verified || reason.trim().length < 10) {
      setError("Verify the account holder and enter a reason (at least 10 characters).")
      return
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError("Enter a password containing 12–128 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.")
      return
    }
    if (!window.confirm(`Set the password you entered for ${ownerName}? The previous password and existing sessions will be revoked.`)) return

    setPending(true)
    setError(null)
    setCompleted(false)
    try {
      const response = await fetch(`/api/provider/owners/${encodeURIComponent(ownerId)}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ new_password: newPassword, reason: reason.trim() }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
        throw new Error(data?.message || data?.detail || "Unable to set the owner password.")
      }
      setNewPassword("")
      setConfirmPassword("")
      setReason("")
      setVerified(false)
      setVisible(false)
      setCompleted(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to set the owner password.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-emerald-800" /> Owner account support</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          After verifying the owner, enter the password you want to assign. This changes the owner&apos;s shared login across the platform and revokes existing sessions. The owner can continue using the assigned password without a forced change.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive"><ShieldAlert /><AlertTitle>Password update failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {completed ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
            <CheckCircle2 /><AlertTitle>Owner password updated</AlertTitle>
            <AlertDescription>
              The password you entered is now active. Share it privately with the verified owner. The previous password and sessions have been revoked; changing this password at the next login is optional.
            </AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={(event) => void reset(event)} className="space-y-3">
          <label className="flex items-start gap-2 text-sm leading-6">
            <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-1 size-4" required />
            I have verified the owner using their registered contact details and confirmed they requested account recovery.
          </label>
          <div className="space-y-2">
            <Label htmlFor="owner-assigned-password">New owner password *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="owner-assigned-password"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={newPassword}
                onChange={(event) => { setNewPassword(event.target.value); setCompleted(false) }}
                placeholder="Enter a secure password (12+ characters)"
                required
              />
              <Button type="button" size="icon" variant="outline" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"}>
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-confirm-password">Confirm new password *</Label>
            <Input
              id="owner-confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => { setConfirmPassword(event.target.value); setCompleted(false) }}
              required
              placeholder="Re-enter the password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-reset-reason">Support reason *</Label>
            <Textarea id="owner-reset-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} rows={3} required placeholder="How did you verify the account holder and confirm this request?" />
          </div>
          <Button type="submit" disabled={pending || !verified || reason.trim().length < 10 || newPassword.length < 12 || newPassword !== confirmPassword} variant="outline" className="border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Set owner password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
