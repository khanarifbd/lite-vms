import { NextResponse } from "next/server"

import { createProviderStaffSchema } from "@/features/provider/staff-schema"
import type {
  ProviderStaffCreatePayload,
  ProviderStaffMember,
  ProviderStaffPage,
} from "@/features/provider/staff-types"
import { authenticatedBackendFetch, BackendApiError } from "@/lib/api/server"

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  return NextResponse.json({ message: fallback }, { status: 500 })
}

export async function GET(request: Request) {
  const source = new URL(request.url)
  const target = new URLSearchParams()

  for (const key of ["search", "status", "offset", "limit"]) {
    const value = source.searchParams.get(key)
    if (value) {
      target.set(key, value)
    }
  }

  try {
    const suffix = target.size ? `?${target.toString()}` : ""
    const page = await authenticatedBackendFetch<ProviderStaffPage>(
      `/providers/staff${suffix}`
    )
    return NextResponse.json(page)
  } catch (error) {
    return errorResponse(error, "Unable to load provider staff.")
  }
}

export async function POST(request: Request) {
  const parsed = createProviderStaffSchema.safeParse(
    await request.json().catch(() => null)
  )

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Invalid staff details." },
      { status: 400 }
    )
  }

  const values = parsed.data
  const payload: ProviderStaffCreatePayload = {
    email: values.email,
    mobile: values.mobile,
    full_name: values.fullName,
    temporary_password: values.temporaryPassword,
    role_code: values.roleCode,
    employee_id: values.employeeId,
    designation: values.designation,
    is_technical_contact: values.isTechnicalContact,
  }

  try {
    const staff = await authenticatedBackendFetch<ProviderStaffMember>(
      "/providers/staff",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    return NextResponse.json(staff, { status: 201 })
  } catch (error) {
    return errorResponse(error, "Unable to create provider staff.")
  }
}
