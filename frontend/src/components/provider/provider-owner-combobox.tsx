"use client"

import { ChevronsUpDown } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { VehicleRegistrationOwnerOption } from "@/components/vehicle/vehicle-registration-form"

type Props = {
  owners: VehicleRegistrationOwnerOption[]
  value: string
  onValueChange: (value: string) => void
  name?: string
  disabled?: boolean
  placeholder?: string
}

export function ProviderOwnerCombobox({
  owners,
  value,
  onValueChange,
  name,
  disabled = false,
  placeholder = "Select owner",
}: Props) {
  const [open, setOpen] = useState(false)
  const selected = owners.find((owner) => owner.id === value)

  return <>
    {name ? <input type="hidden" name={name} value={value} /> : null}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="h-10 w-full justify-between bg-background px-3 font-normal">
          <span className="truncate">{selected ? `${selected.owner_name} · ${selected.owner_code || selected.identity_reference}` : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search owner..." />
          <CommandList>
            <CommandEmpty>No owner found.</CommandEmpty>
            <CommandGroup>
              {owners.map((owner) => <CommandItem
                key={owner.id}
                value={`${owner.owner_name} ${owner.owner_code || ""} ${owner.identity_reference}`}
                data-checked={owner.id === value}
                onSelect={() => { onValueChange(owner.id); setOpen(false) }}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{owner.owner_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{owner.owner_code || owner.identity_reference}</p>
                </div>
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </>
}
