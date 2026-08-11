"use client"

import { Grid2X2, List } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type RegistryViewMode = "list" | "grid"

export function ListViewToggle({ value }: { value: RegistryViewMode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  function changeView(view: RegistryViewMode) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    if (view === "list") params.delete("view")
    else params.set("view", view)
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div className="flex h-9 items-center rounded-md border bg-background p-0.5" aria-label="Change registry view">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("size-8", value === "list" && "bg-emerald-100 text-emerald-900 hover:bg-emerald-100")}
        onClick={() => changeView("list")}
        title="List view"
        aria-pressed={value === "list"}
      >
        <List className="size-4" />
        <span className="sr-only">List view</span>
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("size-8", value === "grid" && "bg-emerald-100 text-emerald-900 hover:bg-emerald-100")}
        onClick={() => changeView("grid")}
        title="Grid view"
        aria-pressed={value === "grid"}
      >
        <Grid2X2 className="size-4" />
        <span className="sr-only">Grid view</span>
      </Button>
    </div>
  )
}
