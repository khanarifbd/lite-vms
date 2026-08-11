"use client"

import { Check, Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function DriverLinkActions({ linkId }: { linkId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null)

  const respond = async (decision: "approve" | "reject") => {
    const notes =
      decision === "reject"
        ? window.prompt("Add a short rejection reason:")
        : null
    if (decision === "reject" && notes === null) return

    setLoading(decision)
    try {
      const response = await fetch(`/api/driver/links/${linkId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "message" in payload
            ? String(payload.message)
            : "Unable to update the connection request."
        )
      }
      toast.success(decision === "approve" ? "Connection approved" : "Connection rejected")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update connection.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mt-3 flex gap-2">
      <Button size="sm" className="h-8 flex-1 bg-emerald-700 text-xs text-white hover:bg-emerald-800" disabled={Boolean(loading)} onClick={() => void respond("approve")}>
        {loading === "approve" ? <Loader2 className="animate-spin" /> : <Check />}
        Approve
      </Button>
      <Button size="sm" variant="outline" className="h-8 flex-1 text-xs text-red-700 hover:text-red-800" disabled={Boolean(loading)} onClick={() => void respond("reject")}>
        {loading === "reject" ? <Loader2 className="animate-spin" /> : <X />}
        Reject
      </Button>
    </div>
  )
}
