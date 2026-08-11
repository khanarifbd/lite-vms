"use client"

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react"
import { type FormEvent, useMemo, useRef, useState } from "react"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VEHICLE_DOCUMENT_DEFINITIONS } from "@/features/vehicles/document-definitions"
import type {
  VehicleDocument,
  VehicleDocumentPage,
  VehicleDocumentType,
} from "@/features/vehicles/document-types"

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })
const PENDING_STATUS = "pending_verification"
const REVOKED_STATUS = "revoked"

type VehicleDocumentsManagerProps = {
  vehicleLabel: string
  initialDocuments: VehicleDocumentPage
  canManage: boolean
  apiBase: string
  readOnlyTitle?: string
  readOnlyDescription?: string
}

function statusLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatDate(value: string | null) {
  if (!value) return "No expiry"
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? "Not available" : dateFormatter.format(parsed)
}

function formatBytes(value: number | null) {
  if (value === null) return "Size unavailable"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

async function responseMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null
  return payload?.message || fallback
}

export function VehicleDocumentsManager({
  vehicleLabel,
  initialDocuments,
  canManage,
  apiBase,
  readOnlyTitle = "Read-only document access",
  readOnlyDescription = "You can review and download documents, but your role cannot upload or replace files.",
}: VehicleDocumentsManagerProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [documents, setDocuments] = useState(initialDocuments)
  const [selectedType, setSelectedType] = useState<VehicleDocumentType>("registration")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const currentDocuments = useMemo(
    () =>
      documents.items.filter(
        (item) =>
          item.is_active &&
          item.verification_status !== PENDING_STATUS &&
          item.verification_status !== REVOKED_STATUS
      ),
    [documents.items]
  )
  const pendingDocuments = useMemo(
    () => documents.items.filter((item) => item.verification_status === PENDING_STATUS),
    [documents.items]
  )
  const historyDocuments = useMemo(
    () =>
      documents.items.filter(
        (item) =>
          !item.is_active && item.verification_status !== PENDING_STATUS
      ),
    [documents.items]
  )
  const selectedExisting =
    pendingDocuments.find((item) => item.document_type === selectedType) ||
    currentDocuments.find((item) => item.document_type === selectedType)

  function documentDownloadHref(documentId: string) {
    return `${apiBase}/${documentId}/download`
  }

  async function reloadDocuments() {
    const response = await fetch(`${apiBase}?include_history=true`, { cache: "no-store" })
    if (!response.ok) {
      throw new Error(await responseMessage(response, "Unable to refresh documents."))
    }
    setDocuments((await response.json()) as VehicleDocumentPage)
  }

  function selectDocument(type: VehicleDocumentType) {
    setSelectedType(type)
    setError(null)
    setSuccess(null)
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setSuccess(null)
    try {
      const formData = new FormData(event.currentTarget)
      formData.set("document_type", selectedType)
      const file = formData.get("file")
      if (!(file instanceof File) || file.size === 0) {
        throw new Error("Select a PDF or image document before uploading.")
      }
      for (const key of ["document_number", "issued_at", "expires_at"]) {
        if (!String(formData.get(key) || "").trim()) formData.delete(key)
      }

      const response = await fetch(apiBase, {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to upload document."))
      }
      await reloadDocuments()
      formRef.current?.reset()
      setSuccess(
        selectedExisting
          ? `${statusLabel(selectedType)} replacement sent for verification. The current approved document remains effective until approval.`
          : `${statusLabel(selectedType)} uploaded and sent for verification.`
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload document.")
    } finally {
      setPending(false)
    }
  }

  function DocumentRow({ item }: { item: VehicleDocument }) {
    const isPending = item.verification_status === PENDING_STATUS
    const recordLabel = isPending
      ? item.is_active
        ? "Pending initial document"
        : "Pending replacement"
      : item.is_active
        ? "Current approved document"
        : "Previous version"
    return (
      <div className="grid gap-3 rounded-2xl border p-4 lg:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(130px,auto))] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{statusLabel(item.document_type)}</p>
            <Badge variant="outline">{recordLabel}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {item.file_name || item.document_number || "Document record"} · {formatBytes(item.size_bytes)} · Version {item.version}
          </p>
          {item.review_notes ? (
            <p className="mt-2 text-xs text-amber-700">Review note: {item.review_notes}</p>
          ) : null}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Verification</p>
          <div className="mt-1">
            <StatusBadge status={item.verification_status} />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Expiry</p>
          <p className="mt-1 font-medium">
            {statusLabel(item.expiry_status)} · {formatDate(item.expires_at)}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={documentDownloadHref(item.id)}>
            <Download /> Download
          </a>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Document action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>Document saved</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {VEHICLE_DOCUMENT_DEFINITIONS.map((definition) => {
          const pendingDocument = pendingDocuments.find(
            (item) => item.document_type === definition.value
          )
          const currentDocument = currentDocuments.find(
            (item) => item.document_type === definition.value
          )
          const displayDocument = pendingDocument || currentDocument
          const isPendingReplacement = Boolean(pendingDocument && currentDocument)
          return (
            <Card key={definition.value}>
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                    <FileText className="size-5" />
                  </div>
                  {displayDocument ? (
                    <StatusBadge
                      status={
                        pendingDocument
                          ? pendingDocument.verification_status
                          : displayDocument.effective_status
                      }
                    />
                  ) : (
                    <Badge variant="outline">Missing</Badge>
                  )}
                </div>
                <CardTitle className="text-base">{definition.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="min-h-10 text-xs leading-5 text-muted-foreground">
                  {definition.description}
                </p>
                {displayDocument ? (
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-muted-foreground">
                    <p className="truncate font-medium text-foreground">
                      {displayDocument.file_name || displayDocument.document_number || "Document file"}
                    </p>
                    <p className="mt-2">
                      Verification: {statusLabel(displayDocument.verification_status)}
                    </p>
                    <p>Expiry: {statusLabel(displayDocument.expiry_status)}</p>
                    <p>Version {displayDocument.version}</p>
                    {isPendingReplacement ? (
                      <p className="mt-2 text-emerald-800">
                        Previous approved version remains effective until Police approval.
                      </p>
                    ) : null}
                    {displayDocument.review_notes ? (
                      <p className="mt-2 text-amber-700">
                        Review note: {displayDocument.review_notes}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-slate-50 px-3 py-5 text-center text-xs text-muted-foreground">
                    No current or pending document
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {displayDocument ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={documentDownloadHref(displayDocument.id)}>
                        <Download /> Download
                      </a>
                    </Button>
                  ) : null}
                  {canManage ? (
                    <Button
                      size="sm"
                      type="button"
                      variant={displayDocument ? "secondary" : "default"}
                      onClick={() => selectDocument(definition.value)}
                    >
                      {displayDocument ? <RefreshCw /> : <Upload />}
                      {pendingDocument ? "Upload newer file" : displayDocument ? "Replace" : "Upload"}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedExisting ? "Replace vehicle document" : "Upload vehicle document"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {vehicleLabel} · Replacements remain staged until Police approval; the currently approved document stays operational.
            </p>
          </CardHeader>
          <CardContent>
            <form
              ref={formRef}
              className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={handleUpload}
            >
              <div className="space-y-2">
                <Label htmlFor="document_type">Document type</Label>
                <select
                  id="document_type"
                  value={selectedType}
                  onChange={(event) => setSelectedType(event.target.value as VehicleDocumentType)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {VEHICLE_DOCUMENT_DEFINITIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="document_number">Document number</Label>
                <Input id="document_number" name="document_number" maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issued_at">Issued date</Label>
                <Input id="issued_at" name="issued_at" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expires_at">Expiry date</Label>
                <Input id="expires_at" name="expires_at" type="date" />
              </div>
              <div className="space-y-2 md:col-span-2 xl:col-span-4">
                <Label htmlFor="file">PDF or image file</Label>
                <Input
                  id="file"
                  name="file"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Accepted formats: PDF, JPG, PNG, and WebP.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
                <Button disabled={pending} type="submit">
                  {pending ? <Loader2 className="animate-spin" /> : <Upload />}
                  {selectedExisting ? "Submit replacement" : "Upload document"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => formRef.current?.reset()}
                >
                  Clear form
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <FileText />
          <AlertTitle>{readOnlyTitle}</AlertTitle>
          <AlertDescription>{readOnlyDescription}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle>Verification and expiry status</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {currentDocuments.length} current · {pendingDocuments.length} pending review · {historyDocuments.length} historical version{historyDocuments.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!historyDocuments.length}
              onClick={() => setShowHistory((current) => !current)}
            >
              <History /> {showHistory ? "Hide history" : "Show history"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingDocuments.map((item) => <DocumentRow key={item.id} item={item} />)}
          {currentDocuments.map((item) => <DocumentRow key={item.id} item={item} />)}
          {!pendingDocuments.length && !currentDocuments.length ? (
            <div className="rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center">
              <FileText className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">No current or pending vehicle documents</p>
            </div>
          ) : null}
          {showHistory && historyDocuments.length ? (
            <div className="space-y-3 border-t pt-5">
              <h3 className="font-semibold">Replacement history</h3>
              {historyDocuments.map((item) => <DocumentRow key={item.id} item={item} />)}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
