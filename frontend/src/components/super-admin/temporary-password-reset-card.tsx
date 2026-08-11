"use client"

import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type EntityType = "provider" | "owner" | "driver"

type Props = {
  entityType: EntityType
  entityId: string
  accountName: string
}

async function responseMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as
    | { message?: string; detail?: string }
    | null
  return body?.message || body?.detail || fallback
}

export function TemporaryPasswordResetCard({ entityType, entityId, accountName }: Props) {
  const [temporaryPassword, setTemporaryPassword] = useState("")
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (temporaryPassword.length < 8) {
      setError("Temporary password must contain at least 8 characters.")
      return
    }
    if (reason.trim().length < 3) {
      setError("Enter a support reason of at least 3 characters.")
      return
    }
    if (!window.confirm(`Issue a temporary password for ${accountName}?`)) return

    setPending(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(
        `/api/super-admin/accounts/${entityType}/${encodeURIComponent(entityId)}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            new_password: temporaryPassword,
            must_change_password: true,
            reason: reason.trim(),
          }),
        }
      )
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to reset the password."))
      }
      setSuccess(
        "Temporary password issued. Existing sessions were revoked and the user must set a new password after login."
      )
      setTemporaryPassword("")
      setReason("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reset the password.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5 text-emerald-700" />
          Support password reset
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Issue a temporary password only after verifying the account holder. The user will be
          forced to create a new password immediately after signing in.
        </p>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          {error ? (
            <Alert variant="destructive">
              <ShieldAlert />
              <AlertTitle>Password reset failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {success ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
              <CheckCircle2 />
              <AlertTitle>Temporary password issued</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`${entityType}-temporary-password`}>Temporary password</Label>
            <Input
              id={`${entityType}-temporary-password`}
              type="text"
              autoComplete="off"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              minLength={8}
              placeholder="Enter a secure temporary password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${entityType}-password-reset-reason`}>Support reason</Label>
            <Textarea
              id={`${entityType}-password-reset-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Example: Account holder verified by registered mobile and requested password recovery."
              required
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="w-full border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Issue temporary password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
