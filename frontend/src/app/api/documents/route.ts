import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME } from "@/lib/auth/cookies"

function sanitizeFileName(value: string) {
  const sanitized = value.replace(/[\r\n"\\/]/g, "_").trim()
  return sanitized || "document"
}

function isValidStorageKey(value: string) {
  return (
    value.startsWith("documents/") &&
    !value.includes("..") &&
    !value.includes("\\") &&
    value.length <= 500
  )
}

function backendDocumentUrl(storageKey: string) {
  const encodedPath = storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  return `${serverEnv.apiBaseUrl}/uploads/documents/${encodedPath}`
}

async function backendErrorMessage(response: Response) {
  const payload = await response.json().catch(() => null)

  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = payload.detail
    if (typeof detail === "string") {
      return detail
    }
  }

  return "Unable to open the requested document."
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const storageKey = searchParams.get("storageKey")?.trim() || ""
  const fileName = sanitizeFileName(searchParams.get("fileName") || "document")
  const shouldDownload = searchParams.get("download") === "1"

  if (!isValidStorageKey(storageKey)) {
    return NextResponse.json({ message: "Invalid document reference." }, { status: 400 })
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 })
  }

  let backendResponse: Response
  try {
    backendResponse = await fetch(backendDocumentUrl(storageKey), {
      headers: {
        Accept: "application/pdf,image/*,application/octet-stream",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })
  } catch {
    return NextResponse.json(
      { message: "The document service is currently unavailable." },
      { status: 502 }
    )
  }

  if (!backendResponse.ok) {
    return NextResponse.json(
      { message: await backendErrorMessage(backendResponse) },
      { status: backendResponse.status }
    )
  }

  const contentType = backendResponse.headers.get("content-type") || "application/octet-stream"
  const body = await backendResponse.arrayBuffer()
  const disposition = shouldDownload ? "attachment" : "inline"

  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `${disposition}; filename="${fileName}"`,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  })
}
