"use client"

import { CalendarRange, CarFront, Clock3, Loader2, RotateCcw } from "lucide-react"
import { FormEvent, useState } from "react"
import { toast } from "sonner"

import { AssignmentEndButton } from "@/components/assignments/assignment-end-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { DriverDutyHistoryPage } from "@/features/driver/duty-types"

const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDateTime(value: string | null) {
  if (!value) return "Currently on duty"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : dateTimeFormatter.format(date)
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days) return `${days}d ${hours}h ${minutes}m`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

async function readHistory(response: Response): Promise<DriverDutyHistoryPage> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "Duty history could not be loaded."
    )
  }
  return payload as DriverDutyHistoryPage
}

export function DriverDutyHistory({ initialData }: { initialData: DriverDutyHistoryPage }) {
  const [history, setHistory] = useState(initialData)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [loading, setLoading] = useState(false)

  async function loadHistory() {
    const params = new URLSearchParams({ offset: "0", limit: "50" })
    if (fromDate) params.set("from_at", new Date(`${fromDate}T00:00:00`).toISOString())
    if (toDate) params.set("to_at", new Date(`${toDate}T23:59:59.999`).toISOString())
    setHistory(await readHistory(await fetch(`/api/driver/duty-history?${params.toString()}`)))
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (fromDate && toDate && fromDate > toDate) {
      toast.error("The start date must be before the end date.")
      return
    }
    setLoading(true)
    try {
      await loadHistory()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Duty history failed.")
    } finally {
      setLoading(false)
    }
  }

  function resetFilters() {
    setFromDate("")
    setToDate("")
    setHistory(initialData)
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="size-5 text-emerald-700" /> My driving duty history
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Exact vehicle and duty intervals retained for incident verification.
            </p>
          </div>
          <form onSubmit={(event) => void applyFilters(event)} className="grid gap-3 sm:grid-cols-[170px_170px_auto_auto]">
            <div className="space-y-1">
              <Label htmlFor="duty-from" className="text-xs">From date</Label>
              <Input id="duty-from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} disabled={loading} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="duty-to" className="text-xs">To date</Label>
              <Input id="duty-to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} disabled={loading} />
            </div>
            <Button type="submit" disabled={loading} className="self-end">
              {loading ? <Loader2 className="animate-spin" /> : <CalendarRange />} Filter
            </Button>
            <Button type="button" variant="outline" onClick={resetFilters} disabled={loading || (!fromDate && !toDate)} className="self-end">
              <RotateCcw /> Reset
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{history.total} duty session{history.total === 1 ? "" : "s"} found</p>
          {history.total > history.items.length ? <Badge variant="outline">Latest {history.items.length} shown</Badge> : null}
        </div>
        {history.items.length ? (
          <div className="space-y-3">
            {history.items.map((item) => (
              <article key={item.id} className="grid gap-4 rounded-2xl border bg-white p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><CarFront className="size-4.5" /></div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.vehicle_registration}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.is_open ? "Current duty" : "Completed duty"}</p>
                  </div>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">Started</p><p className="font-medium">{formatDateTime(item.started_at)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Ended</p><p className="font-medium">{formatDateTime(item.ended_at)}</p></div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">{item.end_reason || item.start_reason}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={item.is_open ? "bg-emerald-700 text-white" : ""} variant={item.is_open ? "default" : "secondary"}>{item.is_open ? "On duty" : "Ended"}</Badge>
                  <p className="font-semibold">{formatDuration(item.duration_seconds)}</p>
                  {item.is_open ? (
                    <AssignmentEndButton
                      assignmentId={item.assignment_id}
                      endpoint={`/api/driver/assignments/${item.assignment_id}/end`}
                      subjectName="You"
                      vehicleRegistration={item.vehicle_registration}
                      triggerLabel="Leave roster"
                      title="Leave this vehicle while on duty?"
                      description="Your current duty session and vehicle assignment will both end. A reason is mandatory."
                      onEnded={loadHistory}
                    />
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 text-center">
            <Clock3 className="size-8 text-emerald-700" />
            <p className="mt-3 font-semibold">No duty history in this period</p>
            <p className="mt-1 text-sm text-muted-foreground">Change the date range or wait until a driving duty is recorded.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
