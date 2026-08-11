import { NextResponse } from "next/server"

import type {
  VehicleDocument,
  VehicleDocumentPage,
} from "@/features/vehicles/document-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ vehicleId: string }>
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function GET(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  const source = new URL(request.url)
  const includeHistory = source.searchParams.get("include_history") !== "false"

  try {
    const result = await authenticatedBackendFetch<VehicleDocumentPage>(
      `/vehicles/provider-registration/${vehicleId}/documents?include_history=${includeHistory}`
    )
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, "Unable to load vehicle documents.")
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { vehicleId } = await context.params
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ message: "Document upload details are required." }, { status: 400 })
  }

  if (!(formData.get("file") instanceof File) || !formData.get("document_type")) {
    return NextResponse.json(
      { message: "Document type and file are required." },
      { status: 400 }
    )
  }

  try {
    const result = await authenticatedBackendFetch<VehicleDocument>(
      `/vehicles/provider-registration/${vehicleId}/documents`,
      {
        method: "POST",
        body: formData,
      }
    )
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error, "Unable to upload the vehicle document.")
  }
}
