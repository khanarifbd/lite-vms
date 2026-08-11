import { NextResponse } from "next/server"

import type { OwnerApplication } from "@/features/owner/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function POST() {
  try {
    const owner = await authenticatedBackendFetch<OwnerApplication>("/owners/me/resubmit", {
      method: "POST",
    })
    return NextResponse.json(owner)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to resubmit owner corrections." }, { status: 500 })
  }
}
