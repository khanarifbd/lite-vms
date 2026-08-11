import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/cookies"

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (token) {
    try {
      await fetch(`${serverEnv.apiBaseUrl}/auth/logout`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      })
    } catch {
      // The browser session is still cleared even if the backend is unavailable.
    }
  }

  const response = NextResponse.json({ message: "Logged out successfully." })
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...authCookieOptions,
    maxAge: 0,
  })

  return response
}
