import "server-only"

import type {
  ApprovalCursorPage,
  ApprovalQueueState,
  ApprovalQueueSummary,
  DocumentApprovalItem,
} from "@/features/approvals/types"
import { authenticatedBackendFetch } from "@/lib/api/server"

type BackendApprovalSummary = Omit<ApprovalQueueSummary, "documents">
type BackendDocumentSummary = {
  pending: number
  expired: number
  expiring_soon: number
  total: number
}
type BackendDocumentPage = Omit<ApprovalCursorPage<DocumentApprovalItem>, "items"> & {
  items: Array<Omit<DocumentApprovalItem, "documents">>
}

export async function getApprovalQueueSummary(): Promise<ApprovalQueueSummary> {
  const [base, documents] = await Promise.all([
    authenticatedBackendFetch<BackendApprovalSummary>("/admin/approvals/summary"),
    authenticatedBackendFetch<BackendDocumentSummary>("/admin/vehicle-documents/summary"),
  ])
  return {
    ...base,
    documents: {
      pending: documents.pending,
      under_review: 0,
      expired: documents.expired,
      expiring_soon: documents.expiring_soon,
      total: documents.total,
    },
    // Only pending document verification is an approval action. Expired and
    // expiring records are operational follow-up lists, not new entity approvals.
    total: base.total + documents.pending,
  }
}

export async function getApprovalQueuePage(
  state: ApprovalQueueState,
  documentType?: string | null
): Promise<ApprovalCursorPage> {
  const query = new URLSearchParams({
    status: state.status,
    sort: state.sort,
    limit: String(state.limit),
    direction: state.direction,
  })

  if (state.search) query.set("search", state.search)
  if (state.cursor) query.set("cursor", state.cursor)

  if (state.entity === "document") {
    if (documentType) query.set("document_type", documentType)
    const page = await authenticatedBackendFetch<BackendDocumentPage>(
      `/admin/vehicle-documents?${query.toString()}`
    )
    return {
      ...page,
      entity: "document",
      items: page.items.map((item) => ({
        ...item,
        documents: [
          {
            id: item.id,
            document_type: item.document_type,
            document_number: item.document_number,
            storage_key: item.storage_key,
            file_name: item.file_name,
            content_type: item.content_type,
            size_bytes: item.size_bytes,
            expires_at: item.expires_at,
            status: item.status,
            review_notes: item.review_notes,
          },
        ],
      })),
    }
  }

  query.set("entity", state.entity)
  return authenticatedBackendFetch<ApprovalCursorPage>(
    `/admin/approvals/queue?${query.toString()}`
  )
}
