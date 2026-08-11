import { NextResponse } from "next/server"

import { updateProviderStaffSchema } from "@/features/provider/staff-schema"
import type {
  ProviderStaffMember,
  ProviderStaffUpdatePayload,
} from "@/features/provider/staff-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

type RouteContext = {
  params: Promise<{ userId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { userId } = await context.params
  if (!userId) {
    return NextResponse.json({ message: "Staff member is required." }, { status: 400 })
  }

  const parsed = updateProviderStaffSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Invalid staff details." },
      { status: 400 }
    )
  }

  const values = parsed.data
  const payload: ProviderStaffUpdatePayload = {
    display_name: values.displayName,
    email: values.email,
    mobile: values.mobile,
    role_code: values.roleCode,
    employee_id: values.employeeId,
    designation: values.designation,
    is_technical_contact: values.isTechnicalContact,
    status: values.status,
  }

  try {
    const staff = await authenticatedBackendFetch<ProviderStaffMember>(
      `/providers/staff/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(staff)
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: "Unable to update provider staff." }, { status: 500 })
  }
}
