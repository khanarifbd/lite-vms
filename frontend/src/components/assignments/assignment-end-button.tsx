"use client"

import { Loader2, UserRoundX } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

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

type AssignmentEndButtonProps = {
  assignmentId: string
  endpoint: string
  subjectName?: string
  vehicleRegistration?: string
  triggerLabel?: string
  title?: string
  description?: string
  onEnded?: () => void | Promise<void>
  disabled?: boolean
  size?: "default" | "sm" | "lg" | "icon"
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
}

async function readMessage(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "The driver assignment could not be ended."
    )
  }
}

export function AssignmentEndButton({
  assignmentId,
  endpoint,
  subjectName = "this driver",
  vehicleRegistration,
  triggerLabel = "Unassign driver",
  title = "End this vehicle assignment?",
  description = "The driver will leave the vehicle roster. If the driver is currently on duty, the active duty session will also be closed.",
  onEnded,
  disabled = false,
  size = "sm",
  variant = "destructive",
}: AssignmentEndButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function endAssignment() {
    const normalizedNotes = notes.trim()
    if (normalizedNotes.length < 3) {
      toast.error("Enter an unassignment note of at least 3 characters.")
      return
    }

    setSubmitting(true)
    try {
      await readMessage(
        await fetch(endpoint, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignment_id: assignmentId,
            notes: normalizedNotes,
          }),
        })
      )
      toast.success(`${subjectName} has been removed from the vehicle roster.`)
      setOpen(false)
      setNotes("")
      if (onEnded) await onEnded()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unassignment failed.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && setOpen(nextOpen)}>
      <DialogTrigger asChild>
        <Button type="button" size={size} variant={variant} disabled={disabled || submitting}>
          <UserRoundX /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
            {vehicleRegistration ? ` Vehicle: ${vehicleRegistration}.` : ""}
            {` This action and note will be retained in the audit history.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`assignment-end-notes-${assignmentId}`}>Reason / note *</Label>
          <Textarea
            id={`assignment-end-notes-${assignmentId}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            minLength={3}
            maxLength={1000}
            disabled={submitting}
            placeholder="Explain why this driver is being removed from the vehicle roster..."
          />
          <p className="text-xs text-muted-foreground">Minimum 3 characters. This note is mandatory.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void endAssignment()}
            disabled={submitting || notes.trim().length < 3}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <UserRoundX />}
            Confirm unassignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
