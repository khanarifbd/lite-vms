import { Download, Eye, FileText, History } from "lucide-react"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AdminVehicleDocument } from "@/features/super-admin/vehicle-review"
import { VEHICLE_DOCUMENT_DEFINITIONS } from "@/features/vehicles/document-definitions"

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })
const PENDING_STATUS = "pending_verification"
const REVOKED_STATUS = "revoked"

function formatDate(value: string | null) {
  if (!value) return "No expiry"
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? "Not available" : dateFormatter.format(parsed)
}

function expiryStatus(document: AdminVehicleDocument) {
  if (document.status === "expired") return "expired"
  if (!document.expires_at) return "not applicable"
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(`${document.expires_at}T00:00:00`)
  if (expiry < today) return "expired"
  const warning = new Date(today)
  warning.setDate(warning.getDate() + 30)
  return expiry <= warning ? "expiring soon" : "valid"
}

function documentHref(document: AdminVehicleDocument, download: boolean) {
  if (!document.storage_key) return null
  const params = new URLSearchParams({
    storageKey: document.storage_key,
    fileName: document.file_name || `${document.document_type}.pdf`,
  })
  if (download) params.set("download", "1")
  return `/api/documents?${params.toString()}`
}

type DocumentActionsProps = {
  document: AdminVehicleDocument
  layout?: "stacked" | "inline"
}

function DocumentActions({ document, layout = "inline" }: DocumentActionsProps) {
  const viewHref = documentHref(document, false)
  const downloadHref = documentHref(document, true)
  if (!viewHref || !downloadHref) return null

  const containerClass =
    layout === "stacked"
      ? "grid w-full grid-cols-1 gap-2"
      : "grid w-full grid-cols-2 gap-2 lg:min-w-[230px]"
  const actionClass =
    "inline-flex h-8 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

  return (
    <div className={containerClass}>
      <a href={viewHref} target="_blank" rel="noreferrer" className={actionClass}>
        <Eye className="size-3.5 shrink-0" />
        <span>View document</span>
      </a>
      <a href={downloadHref} className={actionClass}>
        <Download className="size-3.5 shrink-0" />
        <span>Download</span>
      </a>
    </div>
  )
}

export function AdminVehicleDocumentsView({ documents }: { documents: AdminVehicleDocument[] }) {
  const pending = documents.filter((document) => document.status === PENDING_STATUS)
  const current = documents.filter(
    (document) =>
      document.is_active &&
      document.status !== PENDING_STATUS &&
      document.status !== REVOKED_STATUS
  )
  const history = documents.filter(
    (document) => !document.is_active && document.status !== PENDING_STATUS
  )

  return (
    <div className="space-y-6">
      <section className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-5">
        {VEHICLE_DOCUMENT_DEFINITIONS.map((definition) => {
          const pendingDocument = pending.find(
            (item) => item.document_type === definition.value
          )
          const currentDocument = current.find(
            (item) => item.document_type === definition.value
          )
          const document = pendingDocument || currentDocument

          return (
            <Card key={definition.value} className="flex h-full flex-col">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                    <FileText className="size-5" />
                  </div>
                  {document ? (
                    <StatusBadge status={document.status} />
                  ) : (
                    <Badge variant="outline">Missing</Badge>
                  )}
                </div>
                <CardTitle className="text-base">{definition.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="min-h-10 text-xs leading-5 text-muted-foreground">
                  {definition.description}
                </p>
                {document ? (
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-muted-foreground">
                    <p className="truncate font-medium text-foreground">
                      {document.file_name || document.document_number || "Document file"}
                    </p>
                    <p className="mt-2">
                      Verification: {document.status.replaceAll("_", " ")}
                    </p>
                    <p>Expiry: {expiryStatus(document)} · {formatDate(document.expires_at)}</p>
                    <p>Version {document.version}</p>
                    {pendingDocument && currentDocument ? (
                      <p className="mt-2 text-emerald-800">
                        Current approved version remains effective until this replacement is approved.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-slate-50 px-3 py-5 text-center text-xs text-muted-foreground">
                    No current or pending document
                  </div>
                )}
                {document ? (
                  <div className="mt-auto pt-1">
                    <DocumentActions document={document} layout="stacked" />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5 text-emerald-700" /> Document verification and version history
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {current.length} current · {pending.length} pending review · {history.length} historical version{history.length === 1 ? "" : "s"}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.length ? (
            documents.map((document) => {
              const recordLabel =
                document.status === PENDING_STATUS
                  ? document.is_active
                    ? "Pending initial document"
                    : "Pending replacement"
                  : document.is_active
                    ? "Current approved document"
                    : "Previous version"

              return (
                <article
                  key={document.id}
                  className="grid gap-4 rounded-2xl border p-4 lg:grid-cols-[minmax(260px,1fr)_140px_190px_minmax(230px,auto)] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{document.document_type.replaceAll("_", " ")}</p>
                      <Badge variant="outline">{recordLabel}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {document.document_number || "No reference"} · Version {document.version}
                    </p>
                    {document.review_notes ? (
                      <p className="mt-2 text-xs text-amber-700">Review note: {document.review_notes}</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Verification</p>
                    <div className="mt-1">
                      <StatusBadge status={document.status} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expiry</p>
                    <p className="mt-1 text-sm font-medium">
                      {expiryStatus(document)} · {formatDate(document.expires_at)}
                    </p>
                  </div>
                  <div className="w-full lg:justify-self-end">
                    <DocumentActions document={document} layout="inline" />
                  </div>
                </article>
              )
            })
          ) : (
            <div className="rounded-2xl border border-dashed bg-slate-50 p-10 text-center text-sm text-muted-foreground">
              No vehicle documents uploaded.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
