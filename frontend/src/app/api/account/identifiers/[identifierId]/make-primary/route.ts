import { NextResponse } from "next/server"

import type { AuthUser } from "@/lib/auth/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ identifierId: string }>
}

export async function POST(_: Request, { params }: RouteContext) {
  const { identifierId } = await params
  try {
    const result = await authenticatedBackendFetch<AuthUser>(
      `/auth/me/identifiers/${encodeURIComponent(identifierId)}/make-primary`,
      { method: "POST" }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to make the identifier primary." }, { status: 500 })
  }
}
