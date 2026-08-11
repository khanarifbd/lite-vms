import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/cookies"

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "The new password must be different from the current password.",
    path: ["newPassword"],
  })

function getErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = payload.detail
    if (typeof detail === "string") {
      return detail
    }
  }

  return "Unable to change the password."
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 })
  }

  const parsed = passwordSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Invalid password details." },
      { status: 400 }
    )
  }

  try {
    const backendResponse = await fetch(
      `${serverEnv.apiBaseUrl}/auth/me/change-password`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          current_password: parsed.data.currentPassword,
          new_password: parsed.data.newPassword,
        }),
        cache: "no-store",
      }
    )

    const payload = await backendResponse.json().catch(() => null)

    if (!backendResponse.ok) {
      return NextResponse.json(
        { message: getErrorMessage(payload) },
        { status: backendResponse.status }
      )
    }

    const response = NextResponse.json({
      message: "Password changed successfully. Please sign in again.",
    })
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      ...authCookieOptions,
      maxAge: 0,
    })
    return response
  } catch {
    return NextResponse.json(
      { message: "The authentication service is currently unavailable." },
      { status: 502 }
    )
  }
}
