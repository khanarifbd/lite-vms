"use client"

import {
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { FormEvent, useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type {
  OwnerDocument,
  OwnerDocumentPayload,
  OwnerLookupResult,
  OwnerType,
  ProviderOwnerCustomer,
  ProviderOwnerPage,
  ProviderOwnerRegistrationPayload,
  ProviderOwnerRegistrationResult,
  ProviderOwnerSummary,
} from "@/features/provider/owner-types"
import type { DocumentUploadResult } from "@/features/provider/types"

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
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

async function uploadDocument(file: File) {
  const data = new FormData()
  data.set("file", file)
  return parseResponse<DocumentUploadResult>(
    await fetch("/api/provider/upload", { method: "POST", body: data })
  )
}

function text(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function nullable(value: string) {
  return value ? value : null
}

function documentHref(document: OwnerDocument, download = false) {
  const search = new URLSearchParams({
    storageKey: document.storage_key,
    fileName: document.file_name || `${document.document_type}.pdf`,
    download: download ? "1" : "0",
  })
  return `/api/documents?${search.toString()}`
}

function OwnerDocuments({ documents }: { documents: OwnerDocument[] }) {
  if (!documents.length) {
    return (
      <p className="rounded-xl border border-dashed bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
        No document metadata is available.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((document) => (
        <div
          key={document.id}
          className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <FileText className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium capitalize">
                {document.document_type.replaceAll("_", " ")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {document.file_name || "Stored document"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={document.status} />
            <Button asChild size="sm" variant="outline">
              <a href={documentHref(document)} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" /> Open
              </a>
            </Button>
            <Button asChild size="icon-sm" variant="ghost">
              <a href={documentHref(document, true)} aria-label="Download document">
                <Download aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function RegistrationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [ownerType, setOwnerType] = useState<OwnerType>("individual")
  const [identity, setIdentity] = useState("")
  const [lookup, setLookup] = useState<OwnerLookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [nidFile, setNidFile] = useState<File | null>(null)
  const [companyFile, setCompanyFile] = useState<File | null>(null)
  const [tradeFile, setTradeFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ProviderOwnerRegistrationResult | null>(null)

  const reset = () => {
    setOwnerType("individual")
    setIdentity("")
    setLookup(null)
    setNidFile(null)
    setCompanyFile(null)
    setTradeFile(null)
    setResult(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !submitting) reset()
    onOpenChange(next)
  }

  const checkRegistry = async () => {
    if (identity.trim().length < 3) {
      toast.error("Enter an NID or company registration reference first.")
      return
    }
    setLookupLoading(true)
    try {
      const found = await parseResponse<OwnerLookupResult>(
        await fetch("/api/provider/owners/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_type: ownerType,
            identity_or_registration_reference: identity.trim(),
          }),
        })
      )
      setLookup(found)
      toast.success(found.exists ? "Owner found in the national registry" : "New owner registration")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to search the registry.")
    } finally {
      setLookupLoading(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    if (ownerType === "individual" && !nidFile) {
      toast.error("Upload the owner's National ID document.")
      return
    }
    if (ownerType === "company" && (!companyFile || !tradeFile)) {
      toast.error("Upload company registration and trade licence documents.")
      return
    }
    if (!form.get("declaration")) {
      toast.error("Accept the vehicle-owner declaration before submitting.")
      return
    }

    setSubmitting(true)
    try {
      const documents: OwnerDocumentPayload[] = []
      if (ownerType === "individual" && nidFile) {
        const uploaded = await uploadDocument(nidFile)
        documents.push({
          document_type: "national_id",
          document_reference: identity.trim(),
          storage_key: uploaded.storage_key,
          file_name: uploaded.original_file_name,
          content_type: uploaded.content_type,
          size_bytes: uploaded.size_bytes,
        })
      }
      if (ownerType === "company" && companyFile && tradeFile) {
        const [company, trade] = await Promise.all([
          uploadDocument(companyFile),
          uploadDocument(tradeFile),
        ])
        documents.push(
          {
            document_type: "company_registration",
            document_reference: identity.trim(),
            storage_key: company.storage_key,
            file_name: company.original_file_name,
            content_type: company.content_type,
            size_bytes: company.size_bytes,
          },
          {
            document_type: "trade_license",
            document_reference: text(form, "tradeLicenseNumber"),
            storage_key: trade.storage_key,
            file_name: trade.original_file_name,
            content_type: trade.content_type,
            size_bytes: trade.size_bytes,
          }
        )
      }

      const payload: ProviderOwnerRegistrationPayload = {
        owner_type: ownerType,
        owner_name: text(form, "ownerName"),
        identity_or_registration_reference: identity.trim(),
        phone: nullable(text(form, "phone")),
        email: nullable(text(form, "email")),
        date_of_birth: nullable(text(form, "dateOfBirth")),
        father_name: nullable(text(form, "fatherName")),
        mother_name: nullable(text(form, "motherName")),
        gender: nullable(text(form, "gender")),
        company_type: nullable(text(form, "companyType")),
        incorporation_date: nullable(text(form, "incorporationDate")),
        authorized_person_name: nullable(text(form, "authorizedPersonName")),
        authorized_person_nid: nullable(text(form, "authorizedPersonNid")),
        authorized_person_designation: nullable(text(form, "authorizedPersonDesignation")),
        authorized_person_mobile: nullable(text(form, "authorizedPersonMobile")),
        authorized_person_email: nullable(text(form, "authorizedPersonEmail")),
        trade_license_number: nullable(text(form, "tradeLicenseNumber")),
        tin_number: nullable(text(form, "tinNumber")),
        bin_number: nullable(text(form, "binNumber")),
        registered_address: text(form, "registeredAddress"),
        district: text(form, "district"),
        website_url: nullable(text(form, "websiteUrl")),
        documents,
        declaration_accepted: true,
        contact_email: text(form, "contactEmail"),
        contact_mobile: nullable(text(form, "contactMobile")),
        contact_name: text(form, "contactName"),
        login_username: nullable(text(form, "loginUsername")),
        temporary_password: nullable(text(form, "temporaryPassword")),
      }

      const created = await parseResponse<ProviderOwnerRegistrationResult>(
        await fetch("/api/provider/owners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      )
      setResult(created)
      toast.success(created.message)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to register the owner.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Owner registration completed</DialogTitle>
              <DialogDescription>{result.message}</DialogDescription>
            </DialogHeader>
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <CheckCircle2 />
              <AlertTitle>{result.owner.owner_name}</AlertTitle>
              <AlertDescription>
                Owner code {result.owner.owner_code}. Link status: {result.link.status.replaceAll("_", " ")}.
              </AlertDescription>
            </Alert>
            {result.login_username ? (
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="font-medium">Temporary login created</p>
                <p className="mt-2 text-sm">Username: <strong>{result.login_username}</strong></p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Give the owner the username and temporary password securely. A password change is required on first login.
                </p>
              </div>
            ) : null}
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Register or link a vehicle owner</DialogTitle>
              <DialogDescription>
                Search the national registry first. Existing identities are linked without creating duplicate owner records.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="ownerType">Owner type</Label>
                <select
                  id="ownerType"
                  value={ownerType}
                  onChange={(event) => {
                    setOwnerType(event.target.value as OwnerType)
                    setLookup(null)
                  }}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option value="individual">Individual</option>
                  <option value="company">Company / fleet</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="identity">{ownerType === "individual" ? "National ID number" : "Company registration number"}</Label>
                <Input
                  id="identity"
                  value={identity}
                  onChange={(event) => {
                    setIdentity(event.target.value)
                    setLookup(null)
                  }}
                  required
                  minLength={3}
                />
              </div>
              <Button type="button" variant="outline" onClick={checkRegistry} disabled={lookupLoading}>
                {lookupLoading ? <Loader2 className="animate-spin" /> : <Search />}
                Check registry
              </Button>
            </div>

            {lookup ? (
              <Alert className={lookup.exists ? "border-blue-200 bg-blue-50" : "border-emerald-200 bg-emerald-50"}>
                {lookup.exists ? <ShieldCheck /> : <Plus />}
                <AlertTitle>{lookup.exists ? "Existing owner found" : "New owner record"}</AlertTitle>
                <AlertDescription>
                  {lookup.exists
                    ? `${lookup.owner_name || "Owner"} is already registered. Submitting will request or restore this provider link.`
                    : "Complete the information below to create the owner account and submit it for national verification."}
                </AlertDescription>
              </Alert>
            ) : null}

            <section className="space-y-4">
              <h3 className="font-semibold">Owner identity and contact</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="ownerName" label="Owner / company name" required />
                <Field name="phone" label="Business phone" placeholder="+8801..." />
                <Field name="email" label="Business email" type="email" />
                <Field name="district" label="District" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="registeredAddress">Registered address *</Label>
                <Textarea id="registeredAddress" name="registeredAddress" required minLength={5} />
              </div>
            </section>

            {ownerType === "individual" ? (
              <section className="space-y-4">
                <h3 className="font-semibold">Individual details</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="dateOfBirth" label="Date of birth" type="date" />
                  <Field name="gender" label="Gender" />
                  <Field name="fatherName" label="Father's name" />
                  <Field name="motherName" label="Mother's name" />
                </div>
                <FileField label="National ID document *" onChange={setNidFile} />
              </section>
            ) : (
              <section className="space-y-4">
                <h3 className="font-semibold">Company and authorized person</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="companyType" label="Company type" />
                  <Field name="incorporationDate" label="Incorporation date" type="date" />
                  <Field name="tradeLicenseNumber" label="Trade licence number" required />
                  <Field name="tinNumber" label="TIN number" />
                  <Field name="binNumber" label="BIN number" />
                  <Field name="websiteUrl" label="Website" type="url" />
                  <Field name="authorizedPersonName" label="Authorized person" />
                  <Field name="authorizedPersonDesignation" label="Designation" />
                  <Field name="authorizedPersonNid" label="Authorized person NID" />
                  <Field name="authorizedPersonMobile" label="Authorized person mobile" />
                  <Field name="authorizedPersonEmail" label="Authorized person email" type="email" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FileField label="Company registration document *" onChange={setCompanyFile} />
                  <FileField label="Trade licence document *" onChange={setTradeFile} />
                </div>
              </section>
            )}

            <section className="space-y-4">
              <h3 className="font-semibold">Owner login account</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="contactName" label="Account holder name" required />
                <Field name="contactEmail" label="Login email" type="email" required />
                <Field name="contactMobile" label="Login mobile" placeholder="+8801..." />
                <Field name="loginUsername" label="Login username" required minLength={3} />
                <Field name="temporaryPassword" label="Temporary password" type="password" required minLength={12} />
              </div>
            </section>

            <label className="flex items-start gap-3 rounded-xl border bg-slate-50 p-4 text-sm">
              <input name="declaration" type="checkbox" className="mt-1 size-4 accent-emerald-700" />
              <span>I confirm that the submitted owner identity, contact details, and documents are accurate and authorized for national verification.</span>
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" className="bg-emerald-800 text-white hover:bg-emerald-900" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
                {submitting ? "Submitting..." : "Register / request link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  minLength,
  placeholder,
  defaultValue,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  minLength?: number
  placeholder?: string
  defaultValue?: string | null
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required ? " *" : ""}</Label>
      <Input id={name} name={name} type={type} required={required} minLength={minLength} placeholder={placeholder} defaultValue={defaultValue || ""} />
    </div>
  )
}

function FileField({ label, onChange }: { label: string; onChange: (file: File | null) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => onChange(event.target.files?.[0] || null)} />
    </div>
  )
}

function EditOwnerDialog({
  target,
  onOpenChange,
}: {
  target: ProviderOwnerCustomer | null
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!target) return
    const form = new FormData(event.currentTarget)
    const payload = {
      owner_name: text(form, "ownerName"),
      email: nullable(text(form, "email")),
      mobile: nullable(text(form, "mobile")),
      registered_address: text(form, "registeredAddress"),
      district: text(form, "district"),
      website_url: nullable(text(form, "websiteUrl")),
      trade_license_number: nullable(text(form, "tradeLicenseNumber")),
      tin_number: nullable(text(form, "tinNumber")),
      bin_number: nullable(text(form, "binNumber")),
    }

    setSubmitting(true)
    try {
      const result = await parseResponse<{ reverification_required: boolean }>(
        await fetch(`/api/provider/owners/${target.owner.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      )
      toast.success(
        result.reverification_required
          ? "Owner updated and returned to the verification queue"
          : "Owner details updated"
      )
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the owner.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {target ? (
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Edit {target.owner.owner_name}</DialogTitle>
              <DialogDescription>
                Changes to legal identity or licence information return the owner to national verification.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="ownerName" label="Owner name" required defaultValue={target.owner.owner_name} />
              <Field name="email" label="Email" type="email" defaultValue={target.owner.email} />
              <Field name="mobile" label="Mobile" defaultValue={target.owner.phone} />
              <Field name="district" label="District" required defaultValue={target.owner.district} />
              <Field name="websiteUrl" label="Website" type="url" defaultValue={target.owner.website_url} />
              {target.owner.owner_type === "company" ? (
                <>
                  <Field name="tradeLicenseNumber" label="Trade licence" defaultValue={target.owner.trade_license_number} />
                  <Field name="tinNumber" label="TIN" defaultValue={target.owner.tin_number} />
                  <Field name="binNumber" label="BIN" defaultValue={target.owner.bin_number} />
                </>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="registeredAddress">Registered address *</Label>
              <Textarea id="registeredAddress" name="registeredAddress" required defaultValue={target.owner.registered_address} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="bg-emerald-800 text-white hover:bg-emerald-900">
                {submitting ? <Loader2 className="animate-spin" /> : <Pencil />}
                {submitting ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function ProviderOwnerManagement({
  initialPage,
  summary,
  canRegister,
  canManage,
}: {
  initialPage: ProviderOwnerPage
  summary: ProviderOwnerSummary
  canRegister: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [details, setDetails] = useState<ProviderOwnerCustomer | null>(null)
  const [editing, setEditing] = useState<ProviderOwnerCustomer | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [responding, setResponding] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return initialPage.items.filter((item) => {
      const matchesStatus = status === "all" || item.link.status === status
      const haystack = [
        item.owner.owner_name,
        item.owner.owner_code,
        item.owner.application_number,
        item.owner.identity_or_registration_reference,
        item.owner.email,
        item.owner.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return matchesStatus && (!query || haystack.includes(query))
    })
  }, [initialPage.items, search, status])

  const respond = async (item: ProviderOwnerCustomer, decision: "approve" | "reject") => {
    const note = decision === "reject" ? window.prompt("Reason for rejecting this owner link:") : null
    if (decision === "reject" && !note?.trim()) return
    setResponding(item.link.id)
    try {
      await parseResponse(
        await fetch(`/api/provider/owners/links/${item.link.id}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, notes: note }),
        })
      )
      toast.success(decision === "approve" ? "Owner link approved" : "Owner link rejected")
      setDetails(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the link.")
    } finally {
      setResponding(null)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">National owner registry</Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Vehicle owners</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-100/75 sm:text-base">
                Register customer identities, request provider links, review incoming owner requests, and maintain approved owner accounts within your VTS scope.
              </p>
            </div>
            {canRegister ? (
              <Button onClick={() => setRegisterOpen(true)} className="bg-white text-emerald-950 hover:bg-emerald-50">
                <Plus /> Register / link owner
              </Button>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Linked owners", value: summary.total, icon: UsersRound },
            { label: "Active customers", value: summary.active, icon: ShieldCheck },
            { label: "Owner response due", value: summary.pending_owner_approval, icon: UserRound },
            { label: "Provider response due", value: summary.pending_provider_approval, icon: Building2 },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-3 text-3xl font-semibold">{value}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h2 className="font-semibold">Provider owner portfolio</h2>
                <p className="text-sm text-muted-foreground">{filtered.length} visible record{filtered.length === 1 ? "" : "s"} from {initialPage.total} total.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <div className="relative sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search owner, code, NID, phone..." className="pl-9" />
                </div>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm">
                  <option value="all">All link statuses</option>
                  <option value="active">Active</option>
                  <option value="pending_owner_approval">Owner approval due</option>
                  <option value="pending_provider_approval">Provider approval due</option>
                  <option value="rejected">Rejected</option>
                  <option value="suspended">Suspended</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
            </div>

            {filtered.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>Owner</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead>Provider link</TableHead>
                      <TableHead className="hidden lg:table-cell">Fleet</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={item.owner.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 font-semibold text-emerald-800">
                              {item.owner.owner_type === "company" ? <Building2 className="size-5" /> : <UserRound className="size-5" />}
                            </div>
                            <div>
                              <p className="font-medium">{item.owner.owner_name}</p>
                              <p className="text-xs text-muted-foreground">{item.owner.owner_code} · {item.owner.district}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><StatusBadge status={item.owner.verification_status} /></TableCell>
                        <TableCell><StatusBadge status={item.link.status} /></TableCell>
                        <TableCell className="hidden lg:table-cell">{item.owner.active_vehicles} active / {item.owner.total_vehicles}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setDetails(item)}>View</Button>
                            {canManage && item.can_manage ? (
                              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(item)} aria-label="Edit owner"><Pencil /></Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><UsersRound className="size-7" /></div>
                <h3 className="mt-4 font-semibold">No matching vehicle owners</h3>
                <p className="mt-1 text-sm text-muted-foreground">Register an owner or adjust the search and link-status filter.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RegistrationDialog open={registerOpen} onOpenChange={setRegisterOpen} />
      <EditOwnerDialog target={editing} onOpenChange={(open) => !open && setEditing(null)} />

      <Dialog open={Boolean(details)} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {details ? (
            <>
              <DialogHeader>
                <DialogTitle>{details.owner.owner_name}</DialogTitle>
                <DialogDescription>{details.owner.application_number} · {details.owner.owner_code}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Owner type", details.owner.owner_type],
                  ["Identity reference", details.owner.identity_or_registration_reference],
                  ["District", details.owner.district],
                  ["Phone", details.owner.phone || "Not provided"],
                  ["Email", details.owner.email || "Not provided"],
                  ["Submitted", formatDate(details.owner.submitted_at)],
                  ["Vehicles", `${details.owner.active_vehicles} active / ${details.owner.total_vehicles}`],
                  ["Drivers", String(details.owner.linked_drivers_count)],
                  ["Account", details.account?.status || details.owner.account_status || "Not available"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-1 break-words text-sm font-medium capitalize">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Registered address</p>
                <p className="mt-1 text-sm">{details.owner.registered_address}</p>
              </div>
              {details.owner.review_notes ? (
                <Alert>
                  <FileText />
                  <AlertTitle>National review notes</AlertTitle>
                  <AlertDescription>{details.owner.review_notes}</AlertDescription>
                </Alert>
              ) : null}
              <div>
                <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Documents</h3><Badge variant="secondary">{details.owner.documents.length}</Badge></div>
                <OwnerDocuments documents={details.owner.documents} />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                {canManage && details.link.status === "pending_provider_approval" ? (
                  <>
                    <Button variant="destructive" onClick={() => respond(details, "reject")} disabled={responding === details.link.id}>
                      <XCircle /> Reject link
                    </Button>
                    <Button className="bg-emerald-800 text-white hover:bg-emerald-900" onClick={() => respond(details, "approve")} disabled={responding === details.link.id}>
                      {responding === details.link.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Approve link
                    </Button>
                  </>
                ) : null}
                {canManage && details.can_manage ? (
                  <Button variant="outline" onClick={() => { setEditing(details); setDetails(null) }}><Pencil /> Edit owner</Button>
                ) : null}
                <Button onClick={() => setDetails(null)}>Close</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
