"use client"

import { AlertCircle, Loader2, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"

type ProviderVehicleSubmitButtonProps = {
  vehicleId: string
  label?: string
}

async function responseMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { message?: string } | null
  return body?.message || fallback
}

export function ProviderVehicleSubmitButton({
  vehicleId,
  label = "Submit for police review",
}: ProviderVehicleSubmitButtonProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitVehicle() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/provider/vehicles/${vehicleId}/submit`, {
        method: "POST",
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Unable to submit this vehicle."))
      }
      router.replace(`/provider/vehicles/${vehicleId}?submitted=1`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit this vehicle.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={() => void submitVehicle()}
        disabled={pending}
        className="bg-emerald-800 text-white hover:bg-emerald-900"
      >
        {pending ? <Loader2 className="animate-spin" /> : <Send />}
        {label}
      </Button>
      {error ? (
        <p className="flex max-w-md items-start gap-1.5 text-xs text-red-600">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
