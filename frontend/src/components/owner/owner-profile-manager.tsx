"use client"

import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Download,
  FileClock,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react"
import type { FormEvent } from "react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type {
  OwnerApplication,
  OwnerDocument,
  OwnerDocumentType,
  OwnerProfileUpdatePayload,
} from "@/features/owner/types"

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

const documentLabels: Record<OwnerDocumentType, string> = {
  national_id: "National ID",
  passport: "Passport",
  company_registration: "Company registration",
  trade_license: "Trade licence",
  tin_certificate: "TIN certificate",
  bin_certificate: "BIN certificate",
  authorized_person_id: "Authorized person ID",
  other: "Other document",
}

const individualDocumentTypes: OwnerDocumentType[] = [
  "national_id",
  "passport",
  "tin_certificate",
  "other",
]

const companyDocumentTypes: OwnerDocumentType[] = [
  "company_registration",
  "trade_license",
  "tin_certificate",
  "bin_certificate",
  "authorized_person_id",
  "other",
]

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

function formText(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function nullable(value: string) {
  return value || null
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "The request could not be completed."
    throw new Error(message)
  }
  return payload as T
}

function ProfileField({
  label,
  name,
  value,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string
  name: string
  value: string | null | undefined
  type?: string
  required?: boolean
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={value || ""}
        required={required}
        disabled={disabled}
      />
    </div>
  )
}

function ProfileArea({
  label,
  name,
  value,
  required = false,
  disabled = false,
}: {
  label: string
  name: string
  value: string | null | undefined
  required?: boolean
  disabled?: boolean
}) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        defaultValue={value || ""}
        required={required}
        disabled={disabled}
        rows={3}
      />
    </div>
  )
}

function documentHref(document: OwnerDocument) {
  return `/api/owner/profile/documents/${encodeURIComponent(document.id)}/download`
}

export function OwnerProfileManager({
  initialOwner,
  initialDocuments,
}: {
  initialOwner: OwnerApplication
  initialDocuments: OwnerDocument[]
}) {
  const [owner, setOwner] = useState(initialOwner)
  const [documents, setDocuments] = useState(initialDocuments)
  const [saving, setSaving] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const individual = owner.owner_type === "individual"
  const [documentType, setDocumentType] = useState<OwnerDocumentType>(
    individual ? "national_id" : "company_registration"
  )

  const allowedDocumentTypes = individual ? individualDocumentTypes : companyDocumentTypes
  const requiredDocumentTypes: OwnerDocumentType[] = individual
    ? ["national_id"]
    : ["company_registration", "trade_license"]
  const canEdit = owner.verification_status !== "suspended"
  const canResubmit = ["changes_requested", "rejected"].includes(owner.verification_status)

  const activeDocuments = useMemo(
    () => documents.filter((document) => document.is_active),
    [documents]
  )
  const previousDocuments = useMemo(
    () => documents.filter((document) => !document.is_active),
    [documents]
  )
  const activeByType = useMemo(
    () => new Map(activeDocuments.map((document) => [document.document_type, document])),
    [activeDocuments]
  )

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload: OwnerProfileUpdatePayload = {
      owner_name: formText(form, "owner_name"),
      phone: nullable(formText(form, "phone")),
      email: nullable(formText(form, "email")),
      registered_address: formText(form, "registered_address"),
      district: formText(form, "district"),
      website_url: nullable(formText(form, "website_url")),
      declaration_accepted: true,
    }

    if (individual) {
      payload.date_of_birth = nullable(formText(form, "date_of_birth"))
      payload.father_name = nullable(formText(form, "father_name"))
      payload.mother_name = nullable(formText(form, "mother_name"))
      payload.gender = nullable(formText(form, "gender"))
      payload.present_address = nullable(formText(form, "present_address"))
      payload.permanent_address = nullable(formText(form, "permanent_address"))
      payload.division = nullable(formText(form, "division"))
      payload.upazila = nullable(formText(form, "upazila"))
      payload.postal_code = nullable(formText(form, "postal_code"))
      payload.alternate_phone = nullable(formText(form, "alternate_phone"))
    } else {
      payload.company_type = nullable(formText(form, "company_type"))
      payload.incorporation_date = nullable(formText(form, "incorporation_date"))
      payload.authorized_person_name = nullable(formText(form, "authorized_person_name"))
      payload.authorized_person_nid = nullable(formText(form, "authorized_person_nid"))
      payload.authorized_person_designation = nullable(
        formText(form, "authorized_person_designation")
      )
      payload.authorized_person_mobile = nullable(formText(form, "authorized_person_mobile"))
      payload.authorized_person_email = nullable(formText(form, "authorized_person_email"))
      payload.head_office_address = nullable(formText(form, "head_office_address"))
      payload.operating_address = nullable(formText(form, "operating_address"))
      payload.trade_license_number = nullable(formText(form, "trade_license_number"))
      payload.tin_number = nullable(formText(form, "tin_number"))
      payload.bin_number = nullable(formText(form, "bin_number"))
    }

    setSaving(true)
    try {
      const updated = await parseResponse<OwnerApplication>(
        await fetch("/api/owner/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      )
      setOwner(updated)
      toast.success(
        canResubmit
          ? "Corrections saved. Replace any required documents, then resubmit."
          : "Owner profile updated and returned to verification."
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the owner profile.")
    } finally {
      setSaving(false)
    }
  }

  const uploadDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFile) {
      toast.error("Select a PDF or image document first.")
      return
    }

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const payload = new FormData()
    payload.set("file", selectedFile)
    payload.set("document_type", documentType)

    const documentReference = formText(form, "document_reference")
    const expiryDate = formText(form, "expires_at")
    if (documentReference) payload.set("document_reference", documentReference)
    if (expiryDate) payload.set("expires_at", `${expiryDate}T23:59:59Z`)

    setUploading(true)
    try {
      const uploaded = await parseResponse<OwnerDocument>(
        await fetch("/api/owner/profile/documents", {
          method: "POST",
          body: payload,
        })
      )
      setDocuments((current) => [
        uploaded,
        ...current.map((document) =>
          document.document_type === uploaded.document_type && document.is_active
            ? { ...document, is_active: false, replaced_by_id: uploaded.id }
            : document
        ),
      ])
      setSelectedFile(null)
      formElement.reset()
      setDocumentType(individual ? "national_id" : "company_registration")
      toast.success(`${documentLabels[uploaded.document_type]} saved as version ${uploaded.version}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to upload the owner document.")
    } finally {
      setUploading(false)
    }
  }

  const resubmitCorrections = async () => {
    setResubmitting(true)
    try {
      const updated = await parseResponse<OwnerApplication>(
        await fetch("/api/owner/profile/resubmit", { method: "POST" })
      )
      setOwner(updated)
      setDocuments((current) =>
        current.map((document) =>
          document.is_active
            ? { ...document, status: "pending", verified_at: null }
            : document
        )
      )
      toast.success("Corrections resubmitted for Bangladesh Police review.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to resubmit corrections.")
    } finally {
      setResubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
        <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              Owner profile and documents
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              {owner.owner_name}
            </h1>
            <p className="mt-3 text-emerald-100/75">
              {owner.owner_code} · {owner.application_number} · {owner.district}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={owner.verification_status} />
            {canResubmit ? (
              <Button
                type="button"
                onClick={resubmitCorrections}
                disabled={resubmitting}
                className="bg-white text-emerald-950 hover:bg-emerald-50"
              >
                {resubmitting ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Resubmit corrections
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {owner.review_notes ? (
        <Alert variant={owner.verification_status === "rejected" ? "destructive" : "default"}>
          <ShieldAlert />
          <AlertTitle>Official review notes</AlertTitle>
          <AlertDescription>{owner.review_notes}</AlertDescription>
        </Alert>
      ) : null}

      {canResubmit ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <FileClock />
          <AlertTitle>Correction workflow is open</AlertTitle>
          <AlertDescription>
            Save the requested corrections, replace rejected documents, then resubmit the record.
          </AlertDescription>
        </Alert>
      ) : owner.verification_status === "approved" ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <ShieldCheck />
          <AlertTitle>National owner identity approved</AlertTitle>
          <AlertDescription>
            Editing approved information or replacing a document will return the profile to verification.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              {individual ? (
                <UserRound className="size-5 text-emerald-700" aria-hidden="true" />
              ) : (
                <Building2 className="size-5 text-emerald-700" aria-hidden="true" />
              )}
              Editable owner information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <form
              key={`${owner.updated_at}-${owner.verification_status}`}
              onSubmit={saveProfile}
              className="space-y-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <ProfileField
                  label="Owner name"
                  name="owner_name"
                  value={owner.owner_name}
                  required
                  disabled={!canEdit}
                />
                <ProfileField
                  label="Identity / registration reference"
                  name="identity_reference"
                  value={owner.identity_or_registration_reference}
                  disabled
                />
                <ProfileField label="Phone" name="phone" value={owner.phone} disabled={!canEdit} />
                <ProfileField
                  label="Email"
                  name="email"
                  value={owner.email}
                  type="email"
                  disabled={!canEdit}
                />
                <ProfileField
                  label="District"
                  name="district"
                  value={owner.district}
                  required
                  disabled={!canEdit}
                />
                <ProfileField
                  label="Website"
                  name="website_url"
                  value={owner.website_url}
                  type="url"
                  disabled={!canEdit}
                />
                <ProfileArea
                  label="Registered address"
                  name="registered_address"
                  value={owner.registered_address}
                  required
                  disabled={!canEdit}
                />
              </div>

              {individual ? (
                <div className="grid gap-4 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-2">
                  <ProfileField label="Date of birth" name="date_of_birth" value={owner.date_of_birth} type="date" disabled={!canEdit} />
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <select
                      id="gender"
                      name="gender"
                      defaultValue={owner.gender || ""}
                      disabled={!canEdit}
                      className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Not specified</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <ProfileField label="Father name" name="father_name" value={owner.father_name} disabled={!canEdit} />
                  <ProfileField label="Mother name" name="mother_name" value={owner.mother_name} disabled={!canEdit} />
                  <ProfileField label="Division" name="division" value={owner.division} disabled={!canEdit} />
                  <ProfileField label="Upazila" name="upazila" value={owner.upazila} disabled={!canEdit} />
                  <ProfileField label="Postal code" name="postal_code" value={owner.postal_code} disabled={!canEdit} />
                  <ProfileField label="Alternate phone" name="alternate_phone" value={owner.alternate_phone} disabled={!canEdit} />
                  <ProfileArea label="Present address" name="present_address" value={owner.present_address} disabled={!canEdit} />
                  <ProfileArea label="Permanent address" name="permanent_address" value={owner.permanent_address} disabled={!canEdit} />
                </div>
              ) : (
                <div className="grid gap-4 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-2">
                  <ProfileField label="Company type" name="company_type" value={owner.company_type} disabled={!canEdit} />
                  <ProfileField label="Incorporation date" name="incorporation_date" value={owner.incorporation_date} type="date" disabled={!canEdit} />
                  <ProfileField label="Trade licence number" name="trade_license_number" value={owner.trade_license_number} required disabled={!canEdit} />
                  <ProfileField label="TIN" name="tin_number" value={owner.tin_number} disabled={!canEdit} />
                  <ProfileField label="BIN" name="bin_number" value={owner.bin_number} disabled={!canEdit} />
                  <ProfileField label="Authorized person" name="authorized_person_name" value={owner.authorized_person_name} disabled={!canEdit} />
                  <ProfileField label="Authorized person NID" name="authorized_person_nid" value={owner.authorized_person_nid} disabled={!canEdit} />
                  <ProfileField label="Designation" name="authorized_person_designation" value={owner.authorized_person_designation} disabled={!canEdit} />
                  <ProfileField label="Authorized mobile" name="authorized_person_mobile" value={owner.authorized_person_mobile} disabled={!canEdit} />
                  <ProfileField label="Authorized email" name="authorized_person_email" value={owner.authorized_person_email} type="email" disabled={!canEdit} />
                  <ProfileArea label="Head office address" name="head_office_address" value={owner.head_office_address} disabled={!canEdit} />
                  <ProfileArea label="Operating address" name="operating_address" value={owner.operating_address} disabled={!canEdit} />
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={!canEdit || saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  {canResubmit ? "Save corrections" : "Save profile"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-5 text-emerald-700" aria-hidden="true" />
                Registry timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Submitted</p>
                <p className="mt-1 font-medium">{formatDate(owner.submitted_at)}</p>
              </div>
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Reviewed</p>
                <p className="mt-1 font-medium">{formatDate(owner.reviewed_at)}</p>
              </div>
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Claim status</p>
                <p className="mt-1 font-medium capitalize">{owner.claim_status.replaceAll("_", " ")}</p>
              </div>
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Account</p>
                <p className="mt-1 font-medium">{owner.account_username || "Not available"}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {(owner.account_status || "unknown").replaceAll("_", " ")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-700" aria-hidden="true" />
                Required documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requiredDocumentTypes.map((type) => {
                const document = activeByType.get(type)
                return (
                  <div key={type} className="flex items-center justify-between rounded-xl border p-3">
                    <div>
                      <p className="text-sm font-medium">{documentLabels[type]}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {document ? `Version ${document.version}` : "Missing"}
                      </p>
                    </div>
                    {document ? (
                      <StatusBadge status={document.status} />
                    ) : (
                      <Badge variant="destructive">Required</Badge>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5 text-emerald-700" aria-hidden="true" />
            Owner documents and replacement history
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[0.7fr_1.3fr]">
          <form onSubmit={uploadDocument} className="space-y-4 rounded-2xl border bg-slate-50 p-4">
            <div>
              <h3 className="font-semibold">Upload or replace a document</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                A replacement creates a new version and preserves the previous file.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="document_type">Document type</Label>
              <select
                id="document_type"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as OwnerDocumentType)}
                disabled={!canEdit || uploading}
                className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:opacity-50"
              >
                {allowedDocumentTypes.map((type) => (
                  <option key={type} value={type}>
                    {documentLabels[type]}
                    {requiredDocumentTypes.includes(type) ? " *" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="document_reference">Document reference</Label>
              <Input id="document_reference" name="document_reference" disabled={!canEdit || uploading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expires_at">Expiry date</Label>
              <Input id="expires_at" name="expires_at" type="date" disabled={!canEdit || uploading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner_document">PDF or image</Label>
              <Input
                id="owner_document"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                disabled={!canEdit || uploading}
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={!canEdit || uploading || !selectedFile}>
              {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {activeByType.has(documentType) ? "Replace document" : "Upload document"}
            </Button>
          </form>

          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Active documents</h3>
                <Badge variant="secondary">{activeDocuments.length}</Badge>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {activeDocuments.length ? (
                  activeDocuments.map((document) => (
                    <div key={document.id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{documentLabels[document.document_type]}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {document.file_name || "Stored document"} · Version {document.version}
                          </p>
                        </div>
                        <StatusBadge status={document.status} />
                      </div>
                      {document.review_notes ? (
                        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                          {document.review_notes}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>
                          {document.expires_at ? `Expires ${formatDate(document.expires_at)}` : "No expiry"}
                        </span>
                        <Button asChild size="sm" variant="outline">
                          <a href={documentHref(document)}>
                            <Download /> Download
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed bg-slate-50 px-5 py-10 text-center text-sm text-muted-foreground lg:col-span-2">
                    No active owner documents are available.
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Replacement history</h3>
                <Badge variant="outline">{previousDocuments.length}</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {previousDocuments.length ? (
                  previousDocuments.map((document) => (
                    <div
                      key={document.id}
                      className="flex flex-col gap-3 rounded-xl border bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{documentLabels[document.document_type]}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Version {document.version} · {document.file_name || "Stored document"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Replaced</Badge>
                        <Button asChild size="sm" variant="ghost">
                          <a href={documentHref(document)}>
                            <Download /> Download
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    No previous document versions.
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
