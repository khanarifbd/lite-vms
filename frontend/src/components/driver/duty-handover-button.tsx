"use client"

import { Loader2, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { AssignmentEndButton } from "@/components/assignments/assignment-end-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

async function readMessage(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "Duty handover could not be completed."
    )
  }
}

export function DutyHandoverButton({
  assignmentId,
}: {
  assignmentId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function startDuty() {
    if (reason.trim().length < 3) {
      toast.error("Enter a handover reason of at least 3 characters.")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/driver/assignments/${assignmentId}/start-duty`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        }
      )
      await readMessage(response)
      toast.success("You are now on duty. The previous driver remains on standby.")
      setOpen(false)
      setReason("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Duty handover failed.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => !submitting && setOpen(nextOpen)}
      >
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <RefreshCw /> Start duty
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start this driving shift?</DialogTitle>
            <DialogDescription>
              The current driver will move to standby, not leave the vehicle roster.
              Your reason and the handover are recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="driver-duty-reason">Handover reason *</Label>
            <Textarea
              id="driver-duty-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={1000}
              disabled={submitting}
              placeholder="Relieving the current driver for the next shift..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void startDuty()}
              disabled={submitting || reason.trim().length < 3}
              className="bg-emerald-800 text-white hover:bg-emerald-900"
            >
              {submitting ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Confirm handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignmentEndButton
        assignmentId={assignmentId}
        endpoint={`/api/driver/assignments/${assignmentId}/end`}
        subjectName="You"
        triggerLabel="Leave vehicle roster"
        title="Leave this vehicle assignment?"
        description="You will no longer be assigned to this vehicle. A reason is required and will be visible in the assignment audit history."
        variant="destructive"
      />
    </div>
  )
}
