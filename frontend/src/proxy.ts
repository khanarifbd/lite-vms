import { NextRequest, NextResponse } from "next/server"

import { AUTH_COOKIE_NAME } from "@/lib/auth/cookies"

const protectedRoutePrefixes = [
  "/dashboard",
  "/super-admin",
  "/provider",
  "/owner",
  "/driver",
  "/police",
  "/change-password",
]

function isProtectedRoute(pathname: string) {
  return protectedRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function tokenHasExpired(token: string) {
  try {
    const payloadSegment = token.split(".")[1]
    if (!payloadSegment) return true

    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    const payload = JSON.parse(atob(padded)) as { exp?: unknown }

    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value

  if (!token || !tokenHasExpired(token)) {
    return NextResponse.next()
  }

  if (!isProtectedRoute(request.nextUrl.pathname)) {
    const response = NextResponse.next()
    response.cookies.delete(AUTH_COOKIE_NAME)
    return response
  }

  const loginUrl = new URL("/login", request.url)
  const response = NextResponse.redirect(loginUrl)
  response.cookies.delete(AUTH_COOKIE_NAME)
  return response
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
