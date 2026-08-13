"use client"

import { CalendarDays } from "lucide-react"
import { useRef, useState } from "react"

import { Input } from "@/components/ui/input"

type DateInputWithPicker = HTMLInputElement & {
  showPicker?: () => void
}

type DdMmYyyyInputProps = {
  id?: string
  name: string
  defaultValue?: string | null
  disabled?: boolean
  required?: boolean
}

export function formatDdMmYyyyInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function ddMmYyyyToIso(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return null

  const [, dayText, monthText, yearText] = match
  const day = Number(dayText)
  const month = Number(monthText)
  const year = Number(yearText)
  if (year < 1000) return null

  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return `${yearText}-${monthText}-${dayText}`
}

export function isoToDdMmYyyy(value: string | null | undefined) {
  if (!value) return ""
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return ""
  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}

export function readOptionalDdMmYyyyIso(data: FormData, key: string, label: string) {
  const value = String(data.get(key) || "").trim()
  if (!value) return null

  const isoDate = ddMmYyyyToIso(value)
  if (!isoDate) {
    throw new Error(`${label} must be a valid DD/MM/YYYY date.`)
  }
  return isoDate
}

export function DdMmYyyyInput({
  id,
  name,
  defaultValue = null,
  disabled = false,
  required = false,
}: DdMmYyyyInputProps) {
  const [value, setValue] = useState(() => isoToDdMmYyyy(defaultValue))
  const pickerRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    if (disabled) return
    const picker = pickerRef.current as DateInputWithPicker | null
    if (!picker) return

    picker.value = ddMmYyyyToIso(value) || ""
    if (typeof picker.showPicker === "function") {
      picker.showPicker()
    } else {
      picker.click()
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
        placeholder="DD/MM/YYYY"
        title="Use DD/MM/YYYY, for example 13/08/2026"
        value={value}
        onChange={(event) => setValue(formatDdMmYyyyInput(event.currentTarget.value))}
        disabled={disabled}
        required={required}
        className="pr-11"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Open calendar"
        title="Choose date"
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
        onChange={(event) => {
          if (event.currentTarget.value) {
            setValue(isoToDdMmYyyy(event.currentTarget.value))
          }
        }}
      />
    </div>
  )
}
