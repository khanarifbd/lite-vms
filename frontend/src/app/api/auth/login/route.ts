import { NextResponse } from "next/server"
import { z } from "zod"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/cookies"
import type { BackendLoginResponse, LoginResult } from "@/lib/auth/types"

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(180),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().default(false),
})

function getErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Unable to sign in. Please try again."
  }

  const detail = "detail" in payload ? payload.detail : null
  if (typeof detail === "string") {
    return detail
  }

  return "Unable to sign in. Please verify your credentials and try again."
}

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return NextResponse.json(
      { message: "A valid identifier and password are required." },
      { status: 400 }
    )
  }

  const { identifier, password, rememberMe } = parsed.data
  const form = new URLSearchParams({
    username: identifier,
    password,
  })

  try {
    const backendResponse = await fetch(`${serverEnv.apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      cache: "no-store",
    })

    const payload = await backendResponse.json().catch(() => null)

    if (!backendResponse.ok) {
      return NextResponse.json(
        { message: getErrorMessage(payload) },
        { status: backendResponse.status }
      )
    }

    const login = payload as BackendLoginResponse
    const result: LoginResult = {
      expiresIn: login.expires_in,
      sessionPublicId: login.session_public_id,
      mustChangePassword: login.must_change_password,
      user: login.user,
    }

    const response = NextResponse.json(result)
    response.cookies.set(AUTH_COOKIE_NAME, login.access_token, {
      ...authCookieOptions,
      ...(rememberMe ? { maxAge: login.expires_in } : {}),
    })

    return response
  } catch {
    return NextResponse.json(
      { message: "The authentication service is currently unavailable." },
      { status: 502 }
    )
  }
}
