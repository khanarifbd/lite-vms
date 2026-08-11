import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = url.searchParams.get("q")?.trim()

  if (!query || query.length < 3) {
    return NextResponse.json({ message: "Enter at least 3 characters." }, { status: 400 })
  }

  const endpoint = new URL("https://nominatim.openstreetmap.org/search")
  endpoint.searchParams.set("q", query)
  endpoint.searchParams.set("format", "jsonv2")
  endpoint.searchParams.set("addressdetails", "1")
  endpoint.searchParams.set("limit", "8")
  endpoint.searchParams.set("countrycodes", "bd")

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        "Accept-Language": "en,bn;q=0.8",
        "User-Agent": "BNVP-Test-Platform/1.0",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ message: "Location search service is unavailable." }, { status: 502 })
    }

    const payload = await response.json()
    return NextResponse.json(Array.isArray(payload) ? payload : [])
  } catch {
    return NextResponse.json({ message: "Unable to search for this location." }, { status: 502 })
  }
}
