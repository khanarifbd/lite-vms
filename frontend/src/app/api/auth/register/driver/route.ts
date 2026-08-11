import { NextResponse } from "next/server"
import { z } from "zod"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/cookies"
import type { BackendLoginResponse, LoginResult } from "@/lib/auth/types"

const schema = z
  .object({
    fullName: z.string().trim().min(2).max(180),
    email: z
      .string()
      .trim()
      .max(180)
      .refine(
        (value) => value.length === 0 || z.string().email().safeParse(value).success,
        "Enter a valid email address."
      )
      .optional()
      .default(""),
    mobile: z.string().trim().min(10).max(30),
    password: z.string().min(6).max(128),
    confirmPassword: z.string().min(6).max(128),
    licenceNumber: z.string().trim().min(3).max(100),
    licenceType: z.enum(["professional", "non_professional", "learner"]),
    licenceExpiryDate: z.string().date(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) return fallback
  const detail = payload.detail
  if (typeof detail === "string") return detail
  if (detail && typeof detail === "object" && "message" in detail) return String(detail.message)
  return fallback
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Invalid driver registration details." },
      { status: 400 }
    )
  }

  const input = parsed.data
  try {
    const registrationResponse = await fetch(
      `${serverEnv.apiBaseUrl}/drivers/register-applicant`,
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: input.fullName,
          email: input.email || null,
          mobile: input.mobile,
          password: input.password,
          licence_number: input.licenceNumber,
          licence_type: input.licenceType,
          licence_expiry_date: input.licenceExpiryDate,
        }),
        cache: "no-store",
      }
    )
    const registrationPayload = await registrationResponse.json().catch(() => null)
    if (!registrationResponse.ok) {
      const message =
        registrationResponse.status === 405
          ? "Driver registration is not active on the backend yet. Deploy and restart the latest backend service, then try again."
          : errorMessage(
              registrationPayload,
              "Unable to create the driver applicant account."
            )
      return NextResponse.json({ message }, { status: registrationResponse.status })
    }

    const loginResponse = await fetch(`${serverEnv.apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: input.mobile, password: input.password }),
      cache: "no-store",
    })
    const loginPayload = await loginResponse.json().catch(() => null)
    if (!loginResponse.ok) {
      return NextResponse.json(
        {
          message:
            "Your driver account was created, but automatic sign-in failed. Please sign in with your mobile number.",
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
      { message: "The driver registration service is currently unavailable." },
      { status: 502 }
    )
  }
}
