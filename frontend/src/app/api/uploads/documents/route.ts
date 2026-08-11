import { NextResponse } from "next/server"

import { BackendApiError, authenticatedBackendFetch } from "@/lib/api/server"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Select a document to upload." }, { status: 400 })
    }

    const backendForm = new FormData()
    backendForm.set("file", file, file.name)
    const result = await authenticatedBackendFetch("/uploads/documents", {
      method: "POST",
      body: backendForm,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Document upload is unavailable." }, { status: 502 })
  }
}
