import { NextResponse } from "next/server"

import type { OwnerDocument } from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function POST(request: Request) {
  const incoming = await request.formData().catch(() => null)
  const file = incoming?.get("file")
  const documentType = incoming?.get("document_type")

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Select a document to upload." }, { status: 400 })
  }
  if (typeof documentType !== "string" || !documentType.trim()) {
    return NextResponse.json({ message: "Select the owner document type." }, { status: 400 })
  }

  const formData = new FormData()
  formData.set("file", file)
  formData.set("document_type", documentType)

  const documentReference = incoming?.get("document_reference")
  if (typeof documentReference === "string" && documentReference.trim()) {
    formData.set("document_reference", documentReference.trim())
  }
  const expiresAt = incoming?.get("expires_at")
  if (typeof expiresAt === "string" && expiresAt.trim()) {
    formData.set("expires_at", expiresAt.trim())
  }

  try {
    const document = await authenticatedBackendFetch<OwnerDocument>("/owners/me/documents", {
      method: "POST",
      body: formData,
    })
    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to upload the owner document." }, { status: 500 })
  }
}
