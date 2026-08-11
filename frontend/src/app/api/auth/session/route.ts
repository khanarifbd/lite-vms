import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/cookies"
import type { AuthUser, SessionResult } from "@/lib/auth/types"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 })
  }

  try {
    const backendResponse = await fetch(`${serverEnv.apiBaseUrl}/auth/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })

    if (!backendResponse.ok) {
      const response = NextResponse.json(
        { message: "Your session has expired. Please sign in again." },
        { status: 401 }
      )
      response.cookies.set(AUTH_COOKIE_NAME, "", {
        ...authCookieOptions,
        maxAge: 0,
      })
      return response
    }

    const user = (await backendResponse.json()) as AuthUser
    const result: SessionResult = { user }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { message: "The authentication service is currently unavailable." },
      { status: 502 }
    )
  }
}
