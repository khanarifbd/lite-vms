import { NextResponse } from "next/server"

import type { DocumentUploadResult } from "@/features/provider/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function POST(request: Request) {
  const incoming = await request.formData().catch(() => null)
  const file = incoming?.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Select a document to upload." }, { status: 400 })
  }

  const formData = new FormData()
  formData.set("file", file)

  try {
    const uploaded = await authenticatedBackendFetch<DocumentUploadResult>(
      "/uploads/documents",
      {
        method: "POST",
        body: formData,
      }
    )
    return NextResponse.json(uploaded, { status: 201 })
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to upload the document." }, { status: 500 })
  }
}
