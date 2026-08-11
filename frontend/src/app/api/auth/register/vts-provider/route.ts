import { NextResponse } from "next/server"
import { z } from "zod"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/cookies"
import type { BackendLoginResponse, LoginResult } from "@/lib/auth/types"

const registrationSchema = z
  .object({
    fullName: z.string().trim().min(2).max(180),
    email: z.string().trim().email().max(180),
    mobile: z.string().trim().min(10).max(30),
    password: z.string().min(6).max(128),
    confirmPassword: z.string().min(6).max(128),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) {
    return fallback
  }

  const detail = payload.detail
  if (typeof detail === "string") {
    return detail
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String(detail.message)
  }
  return fallback
}

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Invalid registration details." },
      { status: 400 }
    )
  }

  const { fullName, email, mobile, password } = parsed.data

  try {
    const registrationResponse = await fetch(`${serverEnv.apiBaseUrl}/auth/register`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        full_name: fullName,
        email,
        mobile,
        password,
      }),
      cache: "no-store",
    })

    const registrationPayload = await registrationResponse.json().catch(() => null)
    if (!registrationResponse.ok) {
      return NextResponse.json(
        {
          message: getErrorMessage(
            registrationPayload,
            "Unable to create the VTS provider applicant account."
          ),
        },
        { status: registrationResponse.status }
      )
    }

    const loginForm = new URLSearchParams({ username: email, password })
    const loginResponse = await fetch(`${serverEnv.apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: loginForm,
      cache: "no-store",
    })
    const loginPayload = await loginResponse.json().catch(() => null)

    if (!loginResponse.ok) {
      return NextResponse.json(
        {
          message:
            "Your applicant account was created, but automatic sign-in failed. Please sign in from the login page.",
        },
        { status: 409 }
      )
    }

    const login = loginPayload as BackendLoginResponse
    const result: LoginResult = {
      expiresIn: login.expires_in,
      sessionPublicId: login.session_public_id,
      mustChangePassword: login.must_change_password,
      user: login.user,
    }

    const response = NextResponse.json(result, { status: 201 })
    response.cookies.set(AUTH_COOKIE_NAME, login.access_token, {
      ...authCookieOptions,
      maxAge: login.expires_in,
    })
    return response
  } catch {
    return NextResponse.json(
      { message: "The registration service is currently unavailable." },
      { status: 502 }
    )
  }
}
