import { NextResponse } from "next/server"

import { resetProviderStaffPasswordSchema } from "@/features/provider/staff-schema"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ userId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { userId } = await context.params
  if (!userId) {
    return NextResponse.json({ message: "Staff member is required." }, { status: 400 })
  }

  const parsed = resetProviderStaffPasswordSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Invalid password details." },
      { status: 400 }
    )
  }

  try {
    const result = await authenticatedBackendFetch<{ message: string }>(
      `/providers/staff/${encodeURIComponent(userId)}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_password: parsed.data.newPassword,
          reason: parsed.data.reason,
        }),
      }
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to reset the staff password." }, { status: 500 })
  }
}
