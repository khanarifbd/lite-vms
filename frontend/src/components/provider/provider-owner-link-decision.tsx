"use client"

import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function ProviderOwnerLinkDecision({ linkId }: { linkId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function decide(decision: "approve" | "reject") {
    const note = decision === "reject" ? window.prompt("Reason for rejecting this owner link:") : null
    if (decision === "reject" && !note?.trim()) return
    if (!window.confirm(`${decision === "approve" ? "Approve" : "Reject"} this provider-owner link?`)) return
    setPending(true)
    try {
      const response = await fetch(`/api/provider/owners/links/${encodeURIComponent(linkId)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: note }),
      })
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
        throw new Error(detail?.message || detail?.detail || "Unable to update the owner link.")
      }
      toast.success(decision === "approve" ? "Owner link approved" : "Owner link rejected")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update owner link.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => void decide("reject")}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />} Reject link
      </Button>
      <Button type="button" disabled={pending} onClick={() => void decide("approve")} className="bg-emerald-800 text-white hover:bg-emerald-900">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Approve link
      </Button>
    </div>
  )
}
