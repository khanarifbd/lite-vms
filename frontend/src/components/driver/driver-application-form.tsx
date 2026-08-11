"use client"

import {
  CheckCircle2,
  FileUp,
  Loader2,
  LockKeyhole,
  Save,
  ShieldCheck,
  UploadCloud,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type {
  DocumentUploadResult,
  DriverApplicationPayload,
  DriverDocument,
  DriverProfile,
} from "@/features/driver/types"

type RequiredDocumentType =
  | "national_id_front"
  | "driving_licence_front"
  | "driver_photo"

type UploadState = Partial<Record<RequiredDocumentType, DocumentUploadResult>>

const requiredDocuments: Array<{
  type: RequiredDocumentType
  label: string
  description: string
  accept: string
}> = [
  {
    type: "national_id_front",
    label: "NID front",
    description: "Clear front image or PDF of the national identity card.",
    accept: "image/jpeg,image/png,image/webp,application/pdf",
  },
  {
    type: "driving_licence_front",
    label: "Driving licence front",
    description: "Clear BRTA driving licence front image or PDF.",
    accept: "image/jpeg,image/png,image/webp,application/pdf",
  },
  {
    type: "driver_photo",
    label: "Driver photo",
    description: "Recent passport-style driver photograph.",
    accept: "image/jpeg,image/png,image/webp",
  },
]

function dateInput(value: string | null) {
  return value ? value.slice(0, 10) : ""
}

function nullable(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function existingDocumentMap(documents: DriverDocument[]) {
  const map = new Map<string, DriverDocument>()
  for (const document of documents) {
    if (document.is_active && document.storage_key !== "legacy/missing") {
      map.set(document.document_type, document)
    }
  }
  return map
}

export function DriverApplicationForm({
  profile,
  mode = "application",
}: {
  profile: DriverProfile
  mode?: "application" | "profile-change"
}) {
  const router = useRouter()
  const isProfileChange = mode === "profile-change"
  const locked = isProfileChange
    ? profile.profile_change_status === "pending"
    : profile.application_locked
  const existingDocuments = useMemo(
    () => existingDocumentMap(profile.documents),
    [profile.documents]
  )
  const [uploads, setUploads] = useState<UploadState>({})
  const [uploading, setUploading] = useState<RequiredDocumentType | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(profile.full_name)
  const [nidReference, setNidReference] = useState(profile.nid_reference || "")
  const [dateOfBirth, setDateOfBirth] = useState(dateInput(profile.date_of_birth))
  const [fatherName, setFatherName] = useState(profile.father_name || "")
  const [motherName, setMotherName] = useState(profile.mother_name || "")
  const [gender, setGender] = useState(profile.gender || "")
  const [bloodGroup, setBloodGroup] = useState(profile.blood_group || "")
  const [emergencyName, setEmergencyName] = useState(profile.emergency_contact_name || "")
  const [emergencyPhone, setEmergencyPhone] = useState(profile.emergency_contact_phone || "")
  const [presentAddress, setPresentAddress] = useState(
    profile.present_address === "Application details pending" ? "" : profile.present_address
  )
  const [permanentAddress, setPermanentAddress] = useState(profile.permanent_address || "")
  const [district, setDistrict] = useState(profile.district === "Pending" ? "" : profile.district)
  const [employmentType, setEmploymentType] = useState(profile.employment_type || "")
  const [shiftInformation, setShiftInformation] = useState(profile.shift_information || "")
  const [medicalExpiry, setMedicalExpiry] = useState(
    dateInput(profile.medical_fitness_expiry_date)
  )
  const [vehicleClasses, setVehicleClasses] = useState(
    profile.licence.vehicle_classes.join(", ")
  )
  const [firstIssueDate, setFirstIssueDate] = useState(
    dateInput(profile.licence.first_issue_date)
  )
  const [issueDate, setIssueDate] = useState(dateInput(profile.licence.issue_date))
  const [licenceExpiry, setLicenceExpiry] = useState(
    dateInput(profile.licence.expiry_date)
  )
  const [declaration, setDeclaration] = useState(false)

  const uploadDocument = async (type: RequiredDocumentType, file: File) => {
    setUploading(type)
    setError(null)
    try {
      const body = new FormData()
      body.set("file", file)
      const response = await fetch("/api/uploads/documents", { method: "POST", body })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "message" in payload
            ? String(payload.message)
            : "Unable to upload document."
        )
      }
      setUploads((current) => ({ ...current, [type]: payload as DocumentUploadResult }))
      toast.success("Document uploaded", { description: file.name })
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload document.")
    } finally {
      setUploading(null)
    }
  }

  const resolvedDocument = (type: RequiredDocumentType) => {
    const uploaded = uploads[type]
    if (uploaded) {
      return {
        document_type: type,
        document_reference:
          type === "national_id_front"
            ? nidReference.trim()
            : type === "driving_licence_front"
              ? profile.licence.licence_number
              : null,
        storage_key: uploaded.storage_key,
        file_name: uploaded.original_file_name,
        content_type: uploaded.content_type,
        size_bytes: uploaded.size_bytes,
        expires_at: type === "driving_licence_front" ? licenceExpiry || null : null,
      }
    }
    const existing = existingDocuments.get(type)
    if (!existing) return null
    return {
      document_type: type,
      document_reference:
        type === "national_id_front" ? nidReference.trim() : existing.document_reference,
      storage_key: existing.storage_key,
      file_name: existing.file_name,
      content_type: existing.content_type,
      size_bytes: existing.size_bytes,
      expires_at: existing.expires_at,
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const documents = requiredDocuments
      .map((item) => resolvedDocument(item.type))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
    const classes = vehicleClasses
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)

    if (!fullName.trim() || !presentAddress.trim() || !district.trim()) {
      setError("Full name, present address, and district are required.")
      return
    }
    if (nidReference.trim().replace(/[^A-Za-z0-9]/g, "").length < 10) {
      setError("Enter a valid NID number before submitting the application.")
      return
    }
    if (!licenceExpiry || classes.length === 0) {
      setError("Licence expiry and at least one BRTA vehicle class are required.")
      return
    }
    if (documents.length !== requiredDocuments.length) {
      setError("Upload the required NID, driving licence, and driver photo documents.")
      return
    }
    if (!declaration) {
      setError("Accept the driver declaration before submitting.")
      return
    }

    const payload: DriverApplicationPayload = {
      full_name: fullName.trim(),
      nid_reference: nidReference.trim(),
      date_of_birth: dateOfBirth || null,
      father_name: nullable(fatherName),
      mother_name: nullable(motherName),
      gender: nullable(gender),
      blood_group: nullable(bloodGroup),
      emergency_contact_name: nullable(emergencyName),
      emergency_contact_phone: nullable(emergencyPhone),
      present_address: presentAddress.trim(),
      permanent_address: nullable(permanentAddress),
      district: district.trim(),
      photo_url: uploads.driver_photo?.download_url || profile.photo_url,
      employment_type: nullable(employmentType),
      shift_information: nullable(shiftInformation),
      medical_fitness_expiry_date: medicalExpiry || null,
      vehicle_classes: [...new Set(classes)],
      first_issue_date: firstIssueDate || null,
      issue_date: issueDate || null,
      licence_expiry_date: licenceExpiry,
      documents,
      declaration_accepted: declaration,
    }

    setSubmitting(true)
    try {
      const response = await fetch(
        isProfileChange ? "/api/driver/profile-change" : "/api/driver/profile",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        }
      )
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          result && typeof result === "object" && "message" in result
            ? String(result.message)
            : isProfileChange
              ? "Unable to submit the profile change."
              : "Unable to submit the driver application."
        )
      }
      toast.success(
        isProfileChange ? "Profile change submitted" : "Driver application submitted",
        {
          description: isProfileChange
            ? "Your verified Driver status remains active while Police reviews this change."
            : "Your profile is now ready for Bangladesh Police verification.",
        }
      )
      router.replace("/driver/dashboard")
      router.refresh()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : isProfileChange
            ? "Unable to submit profile change."
            : "Unable to submit application."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {locked ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-emerald-700" />
          <div>
            <p className="font-semibold">
              {isProfileChange
                ? "Profile change awaiting Police review"
                : "Verified application locked"}
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">
              {isProfileChange
                ? "Your verified status and vehicle-assignment eligibility remain active while this request is reviewed."
                : "This first verification application is preserved as approved evidence. Use My profile for any later correction."}
            </p>
          </div>
        </div>
      ) : null}
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-75">
      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">
              Registry identity
            </p>
            <h2 className="mt-1 text-lg font-semibold">Driver and licence identity</h2>
          </div>
          <Badge variant="outline" className="capitalize">
            {profile.verification_status.replaceAll("_", " ")}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Driver code</p>
            <p className="mt-1 text-sm font-semibold">{profile.driver_code}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Mobile login</p>
            <p className="mt-1 text-sm font-semibold">{profile.mobile}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Licence</p>
            <p className="mt-1 text-sm font-semibold">{profile.licence.licence_number}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">NID status</p>
            <p className="mt-1 text-sm font-semibold">{profile.nid_reference ? "Submitted" : "Required below"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">Personal and contact information</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Add the NID now and use information that matches the NID and driving licence.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name" required><Input value={fullName} onChange={(event) => setFullName(event.target.value)} /></Field>
          <Field label="NID number" required><Input value={nidReference} onChange={(event) => setNidReference(event.target.value)} inputMode="numeric" placeholder="Enter national ID number" /></Field>
          <Field label="Date of birth"><Input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} /></Field>
          <Field label="Gender"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={gender} onChange={(event) => setGender(event.target.value)}><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></Field>
          <Field label="Father's name"><Input value={fatherName} onChange={(event) => setFatherName(event.target.value)} /></Field>
          <Field label="Mother's name"><Input value={motherName} onChange={(event) => setMotherName(event.target.value)} /></Field>
          <Field label="Blood group"><Input value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)} placeholder="e.g. B+" /></Field>
          <Field label="Emergency contact name"><Input value={emergencyName} onChange={(event) => setEmergencyName(event.target.value)} /></Field>
          <Field label="Emergency contact phone"><Input value={emergencyPhone} onChange={(event) => setEmergencyPhone(event.target.value)} placeholder="+880..." /></Field>
          <Field label="District" required><Input value={district} onChange={(event) => setDistrict(event.target.value)} /></Field>
          <Field label="Present address" required className="sm:col-span-2 lg:col-span-3"><Textarea rows={3} value={presentAddress} onChange={(event) => setPresentAddress(event.target.value)} /></Field>
          <Field label="Permanent address" className="sm:col-span-2 lg:col-span-3"><Textarea rows={3} value={permanentAddress} onChange={(event) => setPermanentAddress(event.target.value)} /></Field>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">Driving licence and employment</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="BRTA vehicle classes" required><Input value={vehicleClasses} onChange={(event) => setVehicleClasses(event.target.value)} placeholder="LIGHT, MEDIUM, HEAVY" /></Field>
          <Field label="First issue date"><Input type="date" value={firstIssueDate} onChange={(event) => setFirstIssueDate(event.target.value)} /></Field>
          <Field label="Current issue date"><Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></Field>
          <Field label="Licence expiry" required><Input type="date" value={licenceExpiry} onChange={(event) => setLicenceExpiry(event.target.value)} /></Field>
          <Field label="Employment type"><Input value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} placeholder="Full-time / contract" /></Field>
          <Field label="Medical fitness expiry"><Input type="date" value={medicalExpiry} onChange={(event) => setMedicalExpiry(event.target.value)} /></Field>
          <Field label="Shift information" className="sm:col-span-2 lg:col-span-3"><Textarea rows={2} value={shiftInformation} onChange={(event) => setShiftInformation(event.target.value)} placeholder="Optional duty or shift information" /></Field>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
            <UploadCloud className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Required verification documents</h2>
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG, or WEBP within the configured upload limit.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {requiredDocuments.map((document) => {
            const uploaded = uploads[document.type]
            const existing = existingDocuments.get(document.type)
            const ready = Boolean(uploaded || existing)
            return (
              <label key={document.type} className="group cursor-pointer rounded-2xl border border-dashed p-4 transition hover:border-emerald-300 hover:bg-emerald-50/40">
                <input type="file" accept={document.accept} className="sr-only" disabled={Boolean(uploading) || submitting} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(document.type, file); event.currentTarget.value = "" }} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-800">
                    {uploading === document.type ? <Loader2 className="size-4 animate-spin" /> : ready ? <CheckCircle2 className="size-4" /> : <FileUp className="size-4" />}
                  </div>
                  <Badge variant={ready ? "default" : "secondary"}>{ready ? "Ready" : "Required"}</Badge>
                </div>
                <p className="mt-3 text-sm font-semibold">{document.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{document.description}</p>
                <p className="mt-2 truncate text-[10px] text-emerald-700">{uploaded?.original_file_name || existing?.file_name || "Choose file"}</p>
              </label>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <label className="flex items-start gap-3 text-sm leading-6">
          <input type="checkbox" className="mt-1 size-4 rounded border-input accent-emerald-700" checked={declaration} onChange={(event) => setDeclaration(event.target.checked)} />
          <span>I confirm that the identity, licence, address, and uploaded documents are correct and may be verified by Bangladesh Police and BRTA-authorized workflows.</span>
        </label>
        {error ? <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">{error}</div> : null}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-emerald-700" /> {isProfileChange ? "Only this change request is reviewed; verified account status is not reset." : "Submission creates the initial Police-verification review record."}</p>
          <Button type="submit" disabled={submitting || Boolean(uploading)} className="bg-emerald-800 text-white hover:bg-emerald-900">
            {submitting ? <Loader2 className="animate-spin" /> : <Save />}
            {submitting
              ? "Submitting..."
              : isProfileChange
                ? "Submit profile change"
                : "Submit driver application"}
          </Button>
        </div>
      </section>
      </fieldset>
    </form>
  )
}

function Field({ label, required = false, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs sm:text-sm">{label}{required ? <span className="ml-1 text-destructive">*</span> : null}</Label>
      {children}
    </div>
  )
}
