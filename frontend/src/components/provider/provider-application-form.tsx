"use client"

import { useMutation } from "@tanstack/react-query"
import {
  Building2,
  CheckCircle2,
  FileUp,
  Loader2,
  RadioTower,
  Save,
  UsersRound,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm, type UseFormRegister } from "react-hook-form"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type {
  DocumentUploadResult,
  ProviderApplication,
  ProviderApplicationPayload,
  ProviderRegistrationResult,
} from "@/features/provider/types"

type FormValues = {
  legalName: string
  tradeName: string
  companyType: string
  incorporationDate: string
  btrcLicenseNumber: string
  btrcLicenseIssueDate: string
  btrcLicenseExpiryDate: string
  tradeLicenseNumber: string
  tradeLicenseExpiryDate: string
  companyRegistrationNumber: string
  tinNumber: string
  binNumber: string
  registeredAddress: string
  district: string
  websiteUrl: string
  authorizedRepresentativeName: string
  authorizedRepresentativeNid: string
  authorizedRepresentativeDesignation: string
  authorizedRepresentativeMobile: string
  authorizedRepresentativeEmail: string
  technicalContactName: string
  technicalContactEmail: string
  technicalContactMobile: string
  operationsContactName: string
  operationsContactPhone: string
  operationsContactEmail: string
  supportContactName: string
  supportContactPhone: string
  supportContactEmail: string
  emergencyContactName: string
  emergencyContactPhone: string
  emergencyContactEmail: string
  serviceCoverage: string
  supportedProtocols: string
  supportedDeviceBrands: string
  apiBaseUrl: string
  estimatedVehicleCount: string
  currentPlatformName: string
  dataSubmissionIntervalSeconds: string
  allowedServerIps: string
  declarationAccepted: boolean
}

type TextFieldProps = {
  id: keyof FormValues
  label: string
  register: UseFormRegister<FormValues>
  required?: boolean
  type?: string
  placeholder?: string
  disabled?: boolean
}

function TextField({
  id,
  label,
  register,
  required = false,
  type = "text",
  placeholder,
  disabled,
}: TextFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        className="h-11"
        disabled={disabled}
        {...register(id, { required: required ? `${label} is required` : false })}
      />
    </div>
  )
}

function splitList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function nullable(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
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

function defaultValues(application: ProviderApplication | null): FormValues {
  return {
    legalName: application?.legal_name ?? "",
    tradeName: application?.trade_name ?? "",
    companyType: application?.company_type ?? "",
    incorporationDate: application?.incorporation_date ?? "",
    btrcLicenseNumber: application?.btrc_license_number ?? "",
    btrcLicenseIssueDate: application?.btrc_license_issue_date ?? "",
    btrcLicenseExpiryDate: application?.btrc_license_expiry_date ?? "",
    tradeLicenseNumber: application?.trade_license_number ?? "",
    tradeLicenseExpiryDate: application?.trade_license_expiry_date ?? "",
    companyRegistrationNumber: application?.company_registration_number ?? "",
    tinNumber: application?.tin_number ?? "",
    binNumber: application?.bin_number ?? "",
    registeredAddress: application?.registered_address ?? "",
    district: application?.district ?? "",
    websiteUrl: application?.website_url ?? "",
    authorizedRepresentativeName: application?.authorized_representative_name ?? "",
    authorizedRepresentativeNid: application?.authorized_representative_nid ?? "",
    authorizedRepresentativeDesignation:
      application?.authorized_representative_designation ?? "",
    authorizedRepresentativeMobile: application?.authorized_representative_mobile ?? "",
    authorizedRepresentativeEmail: application?.authorized_representative_email ?? "",
    technicalContactName: application?.technical_contact_name ?? "",
    technicalContactEmail: application?.technical_contact_email ?? "",
    technicalContactMobile: application?.technical_contact_phone ?? "+880",
    operationsContactName: application?.operations_contact_name ?? "",
    operationsContactPhone: application?.operations_contact_phone ?? "",
    operationsContactEmail: application?.operations_contact_email ?? "",
    supportContactName: application?.support_contact_name ?? "",
    supportContactPhone: application?.support_contact_phone ?? "",
    supportContactEmail: application?.support_contact_email ?? "",
    emergencyContactName: application?.emergency_contact_name ?? "",
    emergencyContactPhone: application?.emergency_contact_phone ?? "",
    emergencyContactEmail: application?.emergency_contact_email ?? "",
    serviceCoverage: application?.service_coverage.join(", ") ?? "",
    supportedProtocols: application?.supported_protocols.join(", ") ?? "",
    supportedDeviceBrands: application?.supported_device_brands.join(", ") ?? "",
    apiBaseUrl: application?.api_base_url ?? "",
    estimatedVehicleCount: String(application?.estimated_vehicle_count ?? 0),
    currentPlatformName: application?.current_platform_name ?? "",
    dataSubmissionIntervalSeconds: application?.data_submission_interval_seconds
      ? String(application.data_submission_interval_seconds)
      : "",
    allowedServerIps: application?.allowed_server_ips.join(", ") ?? "",
    declarationAccepted: application?.declaration_accepted ?? false,
  }
}

export function ProviderApplicationForm({
  application,
}: {
  application: ProviderApplication | null
}) {
  const router = useRouter()
  const editable =
    !application || application.status === "pending" || application.status === "rejected"
  const [btrcFile, setBtrcFile] = useState<File | null>(null)
  const [tradeFile, setTradeFile] = useState<File | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaultValues(application) })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!values.declarationAccepted) {
        throw new Error("Accept the application declaration before submitting.")
      }

      if (!application && (!btrcFile || !tradeFile)) {
        throw new Error("Upload both the BTRC licence and trade licence documents.")
      }
      if ((btrcFile && !tradeFile) || (!btrcFile && tradeFile)) {
        throw new Error("Upload both required documents when replacing application files.")
      }

      let documents: ProviderApplicationPayload["documents"]
      if (btrcFile && tradeFile) {
        const [btrc, trade] = await Promise.all([
          uploadDocument(btrcFile),
          uploadDocument(tradeFile),
        ])
        documents = [
          {
            document_type: "btrc_license",
            document_number: values.btrcLicenseNumber,
            storage_key: btrc.storage_key,
            file_name: btrc.original_file_name,
            content_type: btrc.content_type,
            size_bytes: btrc.size_bytes,
            expires_at: values.btrcLicenseExpiryDate
              ? `${values.btrcLicenseExpiryDate}T23:59:59Z`
              : null,
          },
          {
            document_type: "trade_license",
            document_number: values.tradeLicenseNumber,
            storage_key: trade.storage_key,
            file_name: trade.original_file_name,
            content_type: trade.content_type,
            size_bytes: trade.size_bytes,
            expires_at: values.tradeLicenseExpiryDate
              ? `${values.tradeLicenseExpiryDate}T23:59:59Z`
              : null,
          },
        ]
      }

      const payload: ProviderApplicationPayload = {
        legal_name: values.legalName.trim(),
        trade_name: nullable(values.tradeName),
        company_type: nullable(values.companyType),
        incorporation_date: nullable(values.incorporationDate),
        btrc_license_number: values.btrcLicenseNumber.trim(),
        btrc_license_issue_date: nullable(values.btrcLicenseIssueDate),
        btrc_license_expiry_date: nullable(values.btrcLicenseExpiryDate),
        trade_license_number: values.tradeLicenseNumber.trim(),
        trade_license_expiry_date: nullable(values.tradeLicenseExpiryDate),
        company_registration_number: nullable(values.companyRegistrationNumber),
        tin_number: nullable(values.tinNumber),
        bin_number: nullable(values.binNumber),
        registered_address: values.registeredAddress.trim(),
        district: values.district.trim(),
        website_url: nullable(values.websiteUrl),
        authorized_representative_name: nullable(values.authorizedRepresentativeName),
        authorized_representative_nid: nullable(values.authorizedRepresentativeNid),
        authorized_representative_designation: nullable(
          values.authorizedRepresentativeDesignation
        ),
        authorized_representative_mobile: nullable(values.authorizedRepresentativeMobile),
        authorized_representative_email: nullable(values.authorizedRepresentativeEmail),
        technical_contact_name: values.technicalContactName.trim(),
        technical_contact_email: values.technicalContactEmail.trim(),
        technical_contact_mobile: values.technicalContactMobile.trim(),
        operations_contact_name: nullable(values.operationsContactName),
        operations_contact_phone: nullable(values.operationsContactPhone),
        operations_contact_email: nullable(values.operationsContactEmail),
        support_contact_name: nullable(values.supportContactName),
        support_contact_phone: nullable(values.supportContactPhone),
        support_contact_email: nullable(values.supportContactEmail),
        emergency_contact_name: nullable(values.emergencyContactName),
        emergency_contact_phone: nullable(values.emergencyContactPhone),
        emergency_contact_email: nullable(values.emergencyContactEmail),
        service_coverage: splitList(values.serviceCoverage),
        supported_protocols: splitList(values.supportedProtocols),
        supported_device_brands: splitList(values.supportedDeviceBrands),
        api_base_url: nullable(values.apiBaseUrl),
        estimated_vehicle_count: Number(values.estimatedVehicleCount || 0),
        current_platform_name: nullable(values.currentPlatformName),
        data_submission_interval_seconds: values.dataSubmissionIntervalSeconds
          ? Number(values.dataSubmissionIntervalSeconds)
          : null,
        allowed_server_ips: splitList(values.allowedServerIps),
        declaration_accepted: values.declarationAccepted,
        ...(documents ? { documents } : {}),
      }

      if (application) {
        return parseResponse<ProviderApplication>(
          await fetch("/api/provider/application", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId: application.id, payload }),
          })
        )
      }

      return parseResponse<ProviderRegistrationResult>(
        await fetch("/api/provider/application", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      )
    },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      await mutation.mutateAsync(values)
      toast.success(application ? "Application updated" : "Application submitted", {
        description: "The provider application is now in the national review queue.",
      })
      router.replace("/provider/dashboard")
      router.refresh()
    } catch (error) {
      setError("root", {
        message:
          error instanceof Error ? error.message : "Unable to submit the application.",
      })
    }
  }

  const loading = isSubmitting || mutation.isPending

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      {!editable ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Application is read-only</AlertTitle>
          <AlertDescription>
            Applications cannot be edited while under review, approved, or suspended.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="text-emerald-700" /> Company and licence information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <TextField id="legalName" label="Legal company name" required register={register} disabled={!editable} />
          <TextField id="tradeName" label="Trade name" register={register} disabled={!editable} />
          <TextField id="companyType" label="Company type" register={register} placeholder="Private Limited, Partnership, etc." disabled={!editable} />
          <TextField id="incorporationDate" label="Incorporation date" type="date" register={register} disabled={!editable} />
          <TextField id="btrcLicenseNumber" label="BTRC licence number" required register={register} disabled={!editable} />
          <TextField id="btrcLicenseIssueDate" label="BTRC licence issue date" type="date" register={register} disabled={!editable} />
          <TextField id="btrcLicenseExpiryDate" label="BTRC licence expiry date" type="date" register={register} disabled={!editable} />
          <TextField id="tradeLicenseNumber" label="Trade licence number" required register={register} disabled={!editable} />
          <TextField id="tradeLicenseExpiryDate" label="Trade licence expiry date" type="date" register={register} disabled={!editable} />
          <TextField id="companyRegistrationNumber" label="Company registration number" register={register} disabled={!editable} />
          <TextField id="tinNumber" label="TIN number" register={register} disabled={!editable} />
          <TextField id="binNumber" label="BIN number" register={register} disabled={!editable} />
          <TextField id="district" label="District" required register={register} disabled={!editable} />
          <TextField id="websiteUrl" label="Website URL" type="url" register={register} placeholder="https://provider.com" disabled={!editable} />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="registeredAddress">Registered address <span className="text-destructive">*</span></Label>
            <Textarea id="registeredAddress" rows={3} disabled={!editable} {...register("registeredAddress", { required: "Registered address is required" })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="text-emerald-700" /> Authorized and operational contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <TextField id="authorizedRepresentativeName" label="Authorized representative" register={register} disabled={!editable} />
          <TextField id="authorizedRepresentativeNid" label="Representative NID" register={register} disabled={!editable} />
          <TextField id="authorizedRepresentativeDesignation" label="Representative designation" register={register} disabled={!editable} />
          <TextField id="authorizedRepresentativeMobile" label="Representative mobile" register={register} placeholder="+8801712345678" disabled={!editable} />
          <TextField id="authorizedRepresentativeEmail" label="Representative email" type="email" register={register} disabled={!editable} />
          <div />
          <TextField id="technicalContactName" label="Technical contact name" required register={register} disabled={!editable} />
          <TextField id="technicalContactEmail" label="Technical contact email" required type="email" register={register} disabled={!editable} />
          <TextField id="technicalContactMobile" label="Technical contact mobile" required register={register} placeholder="+8801712345678" disabled={!editable} />
          <TextField id="operationsContactName" label="Operations contact name" register={register} disabled={!editable} />
          <TextField id="operationsContactPhone" label="Operations contact mobile" register={register} disabled={!editable} />
          <TextField id="operationsContactEmail" label="Operations contact email" type="email" register={register} disabled={!editable} />
          <TextField id="supportContactName" label="Support contact name" register={register} disabled={!editable} />
          <TextField id="supportContactPhone" label="Support contact mobile" register={register} disabled={!editable} />
          <TextField id="supportContactEmail" label="Support contact email" type="email" register={register} disabled={!editable} />
          <TextField id="emergencyContactName" label="Emergency contact name" register={register} disabled={!editable} />
          <TextField id="emergencyContactPhone" label="Emergency contact mobile" register={register} disabled={!editable} />
          <TextField id="emergencyContactEmail" label="Emergency contact email" type="email" register={register} disabled={!editable} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RadioTower className="text-emerald-700" /> Technical integration readiness
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <TextField id="currentPlatformName" label="Current tracking platform" register={register} disabled={!editable} />
          <TextField id="apiBaseUrl" label="API base URL" type="url" register={register} placeholder="https://api.provider.com/v1" disabled={!editable} />
          <TextField id="estimatedVehicleCount" label="Estimated vehicle count" type="number" register={register} disabled={!editable} />
          <TextField id="dataSubmissionIntervalSeconds" label="Submission interval (seconds)" type="number" register={register} disabled={!editable} />
          <div className="space-y-2">
            <Label htmlFor="serviceCoverage">Service coverage</Label>
            <Textarea id="serviceCoverage" rows={3} placeholder="Dhaka, Chattogram, Nationwide" disabled={!editable} {...register("serviceCoverage")} />
            <p className="text-xs text-muted-foreground">Separate values with commas or new lines.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supportedProtocols">Supported protocols</Label>
            <Textarea id="supportedProtocols" rows={3} placeholder="TCP, UDP, HTTP, MQTT" disabled={!editable} {...register("supportedProtocols")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supportedDeviceBrands">Supported device brands</Label>
            <Textarea id="supportedDeviceBrands" rows={3} placeholder="Teltonika, Concox, Queclink" disabled={!editable} {...register("supportedDeviceBrands")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="allowedServerIps">Allowed server IP addresses</Label>
            <Textarea id="allowedServerIps" rows={3} placeholder="203.0.113.10, 2001:db8::1" disabled={!editable} {...register("allowedServerIps")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="text-emerald-700" /> Required documents
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 rounded-2xl border border-dashed p-4">
            <Label htmlFor="btrcFile">BTRC licence document {!application ? <span className="text-destructive">*</span> : null}</Label>
            <Input id="btrcFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={!editable || loading} onChange={(event) => setBtrcFile(event.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG, or WebP.</p>
          </div>
          <div className="space-y-2 rounded-2xl border border-dashed p-4">
            <Label htmlFor="tradeFile">Trade licence document {!application ? <span className="text-destructive">*</span> : null}</Label>
            <Input id="tradeFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={!editable || loading} onChange={(event) => setTradeFile(event.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">Upload both files together when replacing documents.</p>
          </div>

          {application?.documents.length ? (
            <div className="md:col-span-2 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium">Current document versions</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {application.documents.map((document) => (
                  <Badge key={document.id} variant="outline" className="capitalize">
                    {document.document_type.replaceAll("_", " ")} · {document.status}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <label className="flex items-start gap-3 text-sm leading-6">
            <input type="checkbox" className="mt-1 size-4 accent-emerald-700" disabled={!editable} {...register("declarationAccepted")} />
            <span>
              I declare that the submitted company, licence, contact, technical, and document information is accurate and may be verified by Bangladesh Police.
            </span>
          </label>
        </CardContent>
      </Card>

      {Object.keys(errors).length > 0 && !errors.root ? (
        <Alert variant="destructive">
          <AlertTitle>Required information is missing</AlertTitle>
          <AlertDescription>Complete all fields marked with an asterisk.</AlertDescription>
        </Alert>
      ) : null}

      {errors.root ? (
        <Alert variant="destructive">
          <AlertTitle>Application could not be submitted</AlertTitle>
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      ) : null}

      {editable ? (
        <div className="sticky bottom-4 z-10 flex justify-end rounded-2xl border bg-white/95 p-4 shadow-xl backdrop-blur">
          <Button type="submit" className="min-w-48 bg-emerald-800 text-white hover:bg-emerald-900" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Save />}
            {loading ? "Uploading and submitting..." : application ? "Update and resubmit" : "Submit for approval"}
          </Button>
        </div>
      ) : null}
    </form>
  )
}
