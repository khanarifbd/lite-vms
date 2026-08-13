"use client"

import { ArrowLeft, CheckCircle2, Loader2, Search, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type OwnerType = "individual" | "company"

type LookupResult = {
  exists: boolean
  owner_id: string | null
  owner_name: string | null
  mobile: string
  account_exists: boolean
  current_provider_link_status: string | null
  next_action: string
}

async function responseMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as
    | { message?: string; detail?: string | { message?: string } }
    | null
  if (body?.message) return body.message
  if (typeof body?.detail === "string") return body.detail
  if (body?.detail && typeof body.detail === "object" && body.detail.message) {
    return body.detail.message
  }
  return fallback
}

function text(data: FormData, key: string) {
  return String(data.get(key) || "").trim()
}

function optional(data: FormData, key: string) {
  return text(data, key) || null
}

export function ProviderOwnerMobileRegistrationForm() {
  const router = useRouter()
  const [ownerType, setOwnerType] = useState<OwnerType>("individual")
  const [mobile, setMobile] = useState("")
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function checkRegistry() {
    if (!mobile.trim()) {
      setError("Mobile number is required.")
      return
    }
    setChecking(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/provider/owners/mobile-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_type: ownerType, mobile: mobile.trim() }),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to search the registry."))
      }
      const result = (await response.json()) as LookupResult
      setLookup(result)
      setSuccess(
        result.exists
          ? `${result.owner_name || "Owner"} already exists. Submitting will automatically activate this company's owner link.`
          : "No owner exists with this mobile number. Complete the registration below."
      )
    } catch (cause) {
      setLookup(null)
      setError(cause instanceof Error ? cause.message : "Unable to search the registry.")
    } finally {
      setChecking(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (!data.get("declaration")) {
      setError("Accept the owner declaration before submitting.")
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        owner_type: ownerType,
        owner_name: text(data, "owner_name"),
        mobile: mobile.trim(),
        email: optional(data, "email"),
        login_username: optional(data, "login_username"),
        contact_name: text(data, "contact_name"),
        temporary_password: optional(data, "temporary_password"),
        date_of_birth: optional(data, "date_of_birth"),
        father_name: optional(data, "father_name"),
        mother_name: optional(data, "mother_name"),
        gender: optional(data, "gender"),
        company_registration_number: optional(data, "company_registration_number"),
        company_type: optional(data, "company_type"),
        incorporation_date: optional(data, "incorporation_date"),
        authorized_person_name: optional(data, "authorized_person_name"),
        authorized_person_designation: optional(data, "authorized_person_designation"),
        authorized_person_mobile: optional(data, "authorized_person_mobile"),
        authorized_person_email: optional(data, "authorized_person_email"),
        trade_license_number: optional(data, "trade_license_number"),
        tin_number: optional(data, "tin_number"),
        bin_number: optional(data, "bin_number"),
        registered_address: optional(data, "registered_address"),
        district: optional(data, "district"),
        website_url: optional(data, "website_url"),
        documents: [],
        declaration_accepted: true,
      }
      const response = await fetch("/api/provider/owners/mobile-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to register the owner."))
      }
      const result = (await response.json()) as { message: string }
      setSuccess(result.message)
      router.push("/provider/owners?registration=completed")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to register the owner.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Owner registration failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>Registration status</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Find the owner by mobile number</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Mobile is the national owner lookup key and the default Primary login identifier for both individual and company owners.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="owner_type">Owner type</Label>
            <select
              id="owner_type"
              value={ownerType}
              onChange={(event) => {
                setOwnerType(event.target.value as OwnerType)
                setLookup(null)
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="individual">Individual</option>
              <option value="company">Company / fleet</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile number *</Label>
            <Input
              id="mobile"
              type="tel"
              value={mobile}
              onChange={(event) => {
                setMobile(event.target.value)
                setLookup(null)
              }}
              placeholder="+8801712345678"
              required
            />
          </div>
          <Button type="button" variant="outline" onClick={() => void checkRegistry()} disabled={checking}>
            {checking ? <Loader2 className="animate-spin" /> : <Search />} Check registry
          </Button>
        </CardContent>
      </Card>

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>2. Owner profile</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="owner_name">Owner / company name *</Label><Input id="owner_name" name="owner_name" required /></div>
            <div className="space-y-2"><Label htmlFor="district">District</Label><Input id="district" name="district" /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="registered_address">Registered address</Label><Textarea id="registered_address" name="registered_address" /></div>
            {ownerType === "individual" ? (
              <>
                <div className="space-y-2"><Label htmlFor="date_of_birth">Date of birth</Label><Input id="date_of_birth" name="date_of_birth" type="date" /></div>
                <div className="space-y-2"><Label htmlFor="gender">Gender</Label><Input id="gender" name="gender" /></div>
                <div className="space-y-2"><Label htmlFor="father_name">Father&apos;s name</Label><Input id="father_name" name="father_name" /></div>
                <div className="space-y-2"><Label htmlFor="mother_name">Mother&apos;s name</Label><Input id="mother_name" name="mother_name" /></div>
              </>
            ) : (
              <>
                <div className="space-y-2"><Label htmlFor="company_registration_number">Company registration number *</Label><Input id="company_registration_number" name="company_registration_number" required /></div>
                <div className="space-y-2"><Label htmlFor="trade_license_number">Trade licence number *</Label><Input id="trade_license_number" name="trade_license_number" required /></div>
                <div className="space-y-2"><Label htmlFor="company_type">Company type</Label><Input id="company_type" name="company_type" /></div>
                <div className="space-y-2"><Label htmlFor="incorporation_date">Incorporation date</Label><Input id="incorporation_date" name="incorporation_date" type="date" /></div>
                <div className="space-y-2"><Label htmlFor="authorized_person_name">Authorized person</Label><Input id="authorized_person_name" name="authorized_person_name" /></div>
                <div className="space-y-2"><Label htmlFor="authorized_person_mobile">Authorized person mobile</Label><Input id="authorized_person_mobile" name="authorized_person_mobile" type="tel" /></div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Login account</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              A username is required for the owner to sign in. Mobile and email are saved as additional contact and login identifiers.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="contact_name">Account holder name *</Label><Input id="contact_name" name="contact_name" required /></div>
            <div className="space-y-2"><Label>Registered mobile</Label><Input value={mobile} disabled /></div>
            <div className="space-y-2"><Label htmlFor="email">Login email (optional)</Label><Input id="email" name="email" type="email" /></div>
            <div className="space-y-2"><Label htmlFor="login_username">Login username *</Label><Input id="login_username" name="login_username" minLength={3} required /></div>
            <div className="space-y-2"><Label htmlFor="temporary_password">Temporary password (optional)</Label><Input id="temporary_password" name="temporary_password" type="password" minLength={6} /></div>
          </CardContent>
        </Card>

        <label className="flex items-start gap-3 rounded-2xl border bg-slate-50 p-4">
          <input type="checkbox" name="declaration" className="mt-1 size-4" />
          <span className="text-sm leading-6">I confirm that the owner information is accurate and authorized for national verification.</span>
        </label>

        <div className="flex flex-wrap justify-between gap-3">
          <Button asChild variant="outline"><Link href="/provider/owners"><ArrowLeft /> Back to owners</Link></Button>
          <Button type="submit" disabled={submitting || !mobile.trim()} className="bg-emerald-800 text-white hover:bg-emerald-900">
            {submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Register and link owner
          </Button>
        </div>
      </form>
    </div>
  )
}
