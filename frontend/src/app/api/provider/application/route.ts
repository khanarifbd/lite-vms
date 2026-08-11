import { NextResponse } from "next/server"

import type {
  ProviderApplication,
  ProviderApplicationPayload,
  ProviderRegistrationResult,
} from "@/features/provider/types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

export async function GET() {
  try {
    const application = await authenticatedBackendFetch<ProviderApplication>("/providers/me")
    return NextResponse.json(application)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to load provider application." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as ProviderApplicationPayload | null
  if (!payload) {
    return NextResponse.json({ message: "Invalid provider application." }, { status: 400 })
  }

  try {
    const result = await authenticatedBackendFetch<ProviderRegistrationResult>(
      "/providers/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to submit provider application." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { providerId?: string; payload?: ProviderApplicationPayload }
    | null

  if (!body?.providerId || !body.payload) {
    return NextResponse.json({ message: "Provider application details are incomplete." }, { status: 400 })
  }

  try {
    const application = await authenticatedBackendFetch<ProviderApplication>(
      `/providers/${body.providerId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body.payload),
      }
    )
    return NextResponse.json(application)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to update provider application." }, { status: 500 })
  }
}
