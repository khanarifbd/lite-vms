"use client"

import {
  AtSign,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, useEffect, useMemo, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AuthIdentifier, AuthUser } from "@/lib/auth/types"

const identifierTypes = ["email", "mobile", "username"] as const

type IdentifierType = (typeof identifierTypes)[number]
type AvailabilityStatus = "idle" | "checking" | "available" | "unavailable" | "invalid"

type AvailabilityState = {
  status: AvailabilityStatus
  message: string
}

type AvailabilityRecord = AvailabilityState & {
  key: string
}

type IdentifierAvailabilityResult = {
  identifier_type: IdentifierType
  normalized_value: string
  available: boolean
  message: string
}

type Props = {
  user: AuthUser
  workspaceLabel: string
}

const idleAvailability: AvailabilityState = { status: "idle", message: "" }
const checkingAvailability: AvailabilityState = {
  status: "checking",
  message: "Checking availability…",
}

function typeLabel(type: string) {
  if (type === "mobile") return "Mobile number"
  if (type === "username") return "Username"
  return "Email address"
}

function typeIcon(type: string) {
  if (type === "mobile") return Phone
  if (type === "username") return UserRound
  return Mail
}

function placeholder(type: IdentifierType) {
  if (type === "mobile") return "+8801712345678"
  if (type === "username") return "vehicle.owner"
  return "name@example.com"
}

function inputType(type: IdentifierType) {
  if (type === "email") return "email"
  if (type === "mobile") return "tel"
  return "text"
}

function hint(type: IdentifierType) {
  if (type === "mobile") {
    return "Use international format. A Bangladesh number such as 01712345678 is normalized automatically."
  }
  if (type === "username") {
    return "Use 3–50 lowercase letters, numbers, dots, underscores, or hyphens. It must start with a letter."
  }
  return "Use a unique email address that is not attached to another account."
}

function sortIdentifiers(items: AuthIdentifier[]) {
  return [...items].sort((left, right) => {
    if (left.is_primary !== right.is_primary) return left.is_primary ? -1 : 1
    return left.identifier_type.localeCompare(right.identifier_type)
  })
}

async function responseMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string; detail?: string | { message?: string } }
    | null
  if (payload?.message) return payload.message
  if (typeof payload?.detail === "string") return payload.detail
  if (payload?.detail && typeof payload.detail === "object" && payload.detail.message) {
    return payload.detail.message
  }
  return fallback
}

async function checkIdentifierAvailability(
  identifierType: IdentifierType,
  value: string,
  excludeIdentifierId?: string,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({
    identifier_type: identifierType,
    value: value.trim(),
  })
  if (excludeIdentifierId) {
    params.set("exclude_identifier_public_id", excludeIdentifierId)
  }

  const response = await fetch(`/api/account/identifiers/availability?${params.toString()}`, {
    signal,
  })
  if (!response.ok) {
    throw new Error(
      await responseMessage(response, "Unable to check login identifier availability.")
    )
  }
  return (await response.json()) as IdentifierAvailabilityResult
}

function useIdentifierAvailability(
  identifierType: IdentifierType | undefined,
  value: string,
  excludeIdentifierId?: string
) {
  const trimmed = value.trim()
  const queryKey =
    identifierType && trimmed.length >= 3
      ? `${identifierType}:${trimmed}:${excludeIdentifierId || ""}`
      : ""
  const [record, setRecord] = useState<AvailabilityRecord>({
    key: "",
    ...idleAvailability,
  })

  useEffect(() => {
    if (!identifierType || !queryKey) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkIdentifierAvailability(
          identifierType,
          trimmed,
          excludeIdentifierId,
          controller.signal
        )
        setRecord({
          key: queryKey,
          status: result.available ? "available" : "unavailable",
          message: result.message,
        })
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setRecord({
          key: queryKey,
          status: "invalid",
          message:
            cause instanceof Error
              ? cause.message
              : "Unable to check login identifier availability.",
        })
      }
    }, 450)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [excludeIdentifierId, identifierType, queryKey, trimmed])

  if (!queryKey) return idleAvailability
  return record.key === queryKey ? record : checkingAvailability
}

function AvailabilityMessage({ state }: { state: AvailabilityState }) {
  if (state.status === "idle") return null
  if (state.status === "checking") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> {state.message}
      </p>
    )
  }
  if (state.status === "available") {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="size-3.5" /> {state.message}
      </p>
    )
  }
  return <p className="text-xs font-medium text-destructive">{state.message}</p>
}

function blocksSubmission(state: AvailabilityState) {
  return ["checking", "unavailable", "invalid"].includes(state.status)
}

export function LoginIdentifiersManager({ user, workspaceLabel }: Props) {
  const router = useRouter()
  const [identifiers, setIdentifiers] = useState<AuthIdentifier[]>(() =>
    sortIdentifiers(user.identifiers)
  )
  const availableTypes = useMemo(
    () =>
      identifierTypes.filter(
        (type) => !identifiers.some((identifier) => identifier.identifier_type === type)
      ),
    [identifiers]
  )
  const [newType, setNewType] = useState<IdentifierType>(
    availableTypes[0] || "email"
  )
  const [newValue, setNewValue] = useState("")
  const [makePrimary, setMakePrimary] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const primary = useMemo(
    () => identifiers.find((identifier) => identifier.is_primary) || null,
    [identifiers]
  )
  const verifiedCount = useMemo(
    () => identifiers.filter((identifier) => identifier.is_verified).length,
    [identifiers]
  )
  const editingIdentifier = useMemo(
    () => identifiers.find((identifier) => identifier.public_id === editingId) || null,
    [editingId, identifiers]
  )
  const selectedNewType = availableTypes.includes(newType) ? newType : availableTypes[0]
  const newAvailability = useIdentifierAvailability(selectedNewType, newValue)
  const editAvailability = useIdentifierAvailability(
    editingIdentifier?.identifier_type as IdentifierType | undefined,
    editValue,
    editingIdentifier?.public_id
  )

  function applyUser(result: AuthUser, message: string) {
    setIdentifiers(sortIdentifiers(result.identifiers))
    setSuccess(message)
    setError(null)
    router.refresh()
  }

  async function addIdentifier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedNewType) {
      setError("One email, one mobile number, and one username are already configured.")
      return
    }
    const value = newValue.trim()
    if (!value) {
      setError(`${typeLabel(selectedNewType)} is required.`)
      return
    }

    setPendingAction("add")
    setError(null)
    setSuccess(null)
    try {
      const availability = await checkIdentifierAvailability(selectedNewType, value)
      if (!availability.available) {
        throw new Error(availability.message)
      }

      const response = await fetch("/api/account/identifiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier_type: selectedNewType,
          value,
          make_primary: makePrimary,
        }),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to add the login identifier."))
      }
      const result = (await response.json()) as AuthUser
      applyUser(
        result,
        makePrimary
          ? `${typeLabel(selectedNewType)} added and set as the primary login identifier.`
          : `${typeLabel(selectedNewType)} added as a secondary login identifier.`
      )
      setNewValue("")
      setMakePrimary(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add the login identifier.")
    } finally {
      setPendingAction(null)
    }
  }

  function beginEdit(identifier: AuthIdentifier) {
    setEditingId(identifier.public_id)
    setEditValue(identifier.value)
    setError(null)
    setSuccess(null)
  }

  async function updateIdentifier(identifier: AuthIdentifier) {
    const value = editValue.trim()
    if (!value) {
      setError(`${typeLabel(identifier.identifier_type)} is required.`)
      return
    }

    const action = `edit:${identifier.public_id}`
    setPendingAction(action)
    setError(null)
    setSuccess(null)
    try {
      const availability = await checkIdentifierAvailability(
        identifier.identifier_type as IdentifierType,
        value,
        identifier.public_id
      )
      if (!availability.available) {
        throw new Error(availability.message)
      }

      const response = await fetch(
        `/api/account/identifiers/${encodeURIComponent(identifier.public_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        }
      )
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to update the login identifier."))
      }
      const result = (await response.json()) as AuthUser
      applyUser(result, `${typeLabel(identifier.identifier_type)} updated successfully.`)
      setEditingId(null)
      setEditValue("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the login identifier.")
    } finally {
      setPendingAction(null)
    }
  }

  async function makeIdentifierPrimary(identifier: AuthIdentifier) {
    const action = `primary:${identifier.public_id}`
    setPendingAction(action)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(
        `/api/account/identifiers/${encodeURIComponent(identifier.public_id)}/make-primary`,
        { method: "POST" }
      )
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to change the primary identifier."))
      }
      const result = (await response.json()) as AuthUser
      applyUser(result, `${typeLabel(identifier.identifier_type)} is now the primary login identifier.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change the primary identifier.")
    } finally {
      setPendingAction(null)
    }
  }

  async function removeIdentifier(identifier: AuthIdentifier) {
    if (identifier.is_primary || identifiers.length <= 1) return
    const confirmed = window.confirm(
      `Remove ${identifier.value} from the active login identifiers for this account?`
    )
    if (!confirmed) return

    const action = `remove:${identifier.public_id}`
    setPendingAction(action)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(
        `/api/account/identifiers/${encodeURIComponent(identifier.public_id)}`,
        { method: "DELETE" }
      )
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to remove the login identifier."))
      }
      const result = (await response.json()) as AuthUser
      applyUser(result, `${typeLabel(identifier.identifier_type)} removed from active login access.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove the login identifier.")
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <KeyRound />
          <AlertTitle>Login identifier action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>Login identifiers updated</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Active identifiers</p>
            <p className="mt-3 text-3xl font-semibold">{identifiers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Primary identifier</p>
            <p className="mt-3 truncate text-lg font-semibold">
              {primary ? primary.value : "Not configured"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {primary ? typeLabel(primary.identifier_type) : "Add an identifier to continue"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Verified identifiers</p>
            <p className="mt-3 text-3xl font-semibold">{verifiedCount}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AtSign className="size-5 text-emerald-700" /> Login identifiers
              </CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The {workspaceLabel} account can have at most one email, one mobile number, and one username.
                One identifier is Primary; the other active identifier types are Secondary.
              </p>
            </div>
            <Badge variant="outline">Maximum 3 identifiers</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {identifiers.map((identifier) => {
            const Icon = typeIcon(identifier.identifier_type)
            const editing = editingId === identifier.public_id
            const editPending = pendingAction === `edit:${identifier.public_id}`
            const primaryPending = pendingAction === `primary:${identifier.public_id}`
            const removePending = pendingAction === `remove:${identifier.public_id}`
            const canRemove = !identifier.is_primary && identifiers.length > 1

            return (
              <article key={identifier.public_id} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{typeLabel(identifier.identifier_type)}</p>
                        <Badge className={identifier.is_primary ? "bg-emerald-800" : ""} variant={identifier.is_primary ? "default" : "secondary"}>
                          {identifier.is_primary ? "Primary" : "Secondary"}
                        </Badge>
                        <Badge variant={identifier.is_verified ? "outline" : "secondary"}>
                          {identifier.is_verified ? "Verified" : "Verification pending"}
                        </Badge>
                      </div>
                      <p className="mt-2 break-all text-sm font-medium">{identifier.value}</p>
                      {identifier.identifier_type !== "username" && !identifier.is_verified ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Updating an email or mobile identifier resets its verification status.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {!editing ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pendingAction !== null}
                        onClick={() => beginEdit(identifier)}
                      >
                        <Pencil /> Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={identifier.is_primary || pendingAction !== null}
                        onClick={() => void makeIdentifierPrimary(identifier)}
                      >
                        {primaryPending ? <Loader2 className="animate-spin" /> : <Star />}
                        {identifier.is_primary ? "Primary" : "Make primary"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={!canRemove || pendingAction !== null}
                        title={
                          identifier.is_primary
                            ? "Make another identifier primary before removing this one."
                            : identifiers.length <= 1
                              ? "The final active identifier cannot be removed."
                              : "Remove identifier"
                        }
                        onClick={() => void removeIdentifier(identifier)}
                      >
                        {removePending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>

                {editing ? (
                  <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
                    <Label htmlFor={`identifier-${identifier.public_id}`}>
                      Updated {typeLabel(identifier.identifier_type).toLowerCase()}
                    </Label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Input
                        id={`identifier-${identifier.public_id}`}
                        type={inputType(identifier.identifier_type as IdentifierType)}
                        value={editValue}
                        onChange={(event) => setEditValue(event.target.value)}
                        disabled={pendingAction !== null}
                      />
                      <Button
                        type="button"
                        disabled={pendingAction !== null || blocksSubmission(editAvailability)}
                        onClick={() => void updateIdentifier(identifier)}
                      >
                        {editPending ? <Loader2 className="animate-spin" /> : <Save />} Save
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pendingAction !== null}
                        onClick={() => {
                          setEditingId(null)
                          setEditValue("")
                        }}
                      >
                        <X /> Cancel
                      </Button>
                    </div>
                    <div className="mt-2">
                      <AvailabilityMessage state={editAvailability} />
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-5 text-emerald-700" /> Add identifier type
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Each account may contain only one email, one mobile number, and one username.
          </p>
        </CardHeader>
        <CardContent>
          {availableTypes.length ? (
            <form className="space-y-5" onSubmit={addIdentifier}>
              <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="new_identifier_type">Identifier type</Label>
                  <select
                    id="new_identifier_type"
                    value={selectedNewType}
                    onChange={(event) => {
                      setNewType(event.target.value as IdentifierType)
                      setNewValue("")
                    }}
                    disabled={pendingAction !== null}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {availableTypes.map((type) => (
                      <option key={type} value={type}>{typeLabel(type)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_identifier_value">{typeLabel(selectedNewType)}</Label>
                  <Input
                    id="new_identifier_value"
                    type={inputType(selectedNewType)}
                    value={newValue}
                    onChange={(event) => setNewValue(event.target.value)}
                    placeholder={placeholder(selectedNewType)}
                    disabled={pendingAction !== null}
                    required
                  />
                  <p className="text-xs leading-5 text-muted-foreground">{hint(selectedNewType)}</p>
                  <AvailabilityMessage state={newAvailability} />
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={makePrimary}
                  onChange={(event) => setMakePrimary(event.target.checked)}
                  disabled={pendingAction !== null}
                  className="mt-1 size-4 rounded border-input"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="size-4 text-emerald-700" /> Make this the primary identifier
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    The current primary identifier remains active and becomes Secondary.
                  </span>
                </span>
              </label>

              <Button
                type="submit"
                disabled={pendingAction !== null || blocksSubmission(newAvailability)}
                className="bg-emerald-800 text-white hover:bg-emerald-900"
              >
                {pendingAction === "add" ? <Loader2 className="animate-spin" /> : <Plus />}
                Add login identifier
              </Button>
            </form>
          ) : (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
              <CheckCircle2 />
              <AlertTitle>All identifier types are configured</AlertTitle>
              <AlertDescription>
                This account already has one email, one mobile number, and one username. Edit an existing value instead of adding another identifier of the same type.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
