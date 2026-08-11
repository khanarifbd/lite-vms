"use client"

import { Building2, Check, ChevronDown, Search, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type OrganizationTreeItem = {
  public_id: string
  parent_public_id: string | null
  code?: string
  name_en: string
  name_bn: string | null
  organization_type: string
  status?: string
}

export type FlattenedOrganization<T extends OrganizationTreeItem = OrganizationTreeItem> = T & { depth: number }

function displayName(item: OrganizationTreeItem) {
  return item.name_bn || item.name_en
}

function organizationMeta(item: OrganizationTreeItem) {
  return [item.name_en, item.code].filter(Boolean).join(" · ")
}

export function flattenOrganizationTree<T extends OrganizationTreeItem>(items: T[]): FlattenedOrganization<T>[] {
  const byParent = new Map<string | null, T[]>()
  for (const item of items) {
    const siblings = byParent.get(item.parent_public_id) || []
    siblings.push(item)
    byParent.set(item.parent_public_id, siblings)
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => displayName(a).localeCompare(displayName(b), "bn"))
  }

  const result: FlattenedOrganization<T>[] = []
  const visited = new Set<string>()
  function visit(parentId: string | null, depth: number) {
    for (const item of byParent.get(parentId) || []) {
      if (visited.has(item.public_id)) continue
      visited.add(item.public_id)
      result.push({ ...item, depth })
      visit(item.public_id, depth + 1)
    }
  }
  visit(null, 0)
  for (const item of items) {
    if (!visited.has(item.public_id)) result.push({ ...item, depth: 0 })
  }
  return result
}

function descendantIds(items: OrganizationTreeItem[], rootId?: string) {
  if (!rootId) return new Set<string>()
  const children = new Map<string, string[]>()
  for (const item of items) {
    if (!item.parent_public_id) continue
    children.set(item.parent_public_id, [...(children.get(item.parent_public_id) || []), item.public_id])
  }
  const result = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length) {
    const current = queue.shift()!
    for (const child of children.get(current) || []) {
      if (result.has(child)) continue
      result.add(child)
      queue.push(child)
    }
  }
  return result
}

export function OrganizationTreeSelect({
  name,
  items,
  defaultValue = "",
  rootLabel = "Root organization — no parent",
  excludeBranchId,
  help,
}: {
  name: string
  items: OrganizationTreeItem[]
  defaultValue?: string
  rootLabel?: string
  excludeBranchId?: string
  help?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [value, setValue] = useState(defaultValue)
  const excluded = useMemo(() => descendantIds(items, excludeBranchId), [items, excludeBranchId])
  const tree = useMemo(() => flattenOrganizationTree(items.filter((item) => !excluded.has(item.public_id))), [items, excluded])
  const selected = items.find((item) => item.public_id === value)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visible = normalizedQuery
    ? tree.filter((item) => `${item.name_bn || ""} ${item.name_en} ${item.code || ""} ${item.organization_type}`.toLocaleLowerCase().includes(normalizedQuery))
    : tree

  function choose(next: string) {
    setValue(next)
    setOpen(false)
    setQuery("")
  }

  return <div className="relative grid gap-2">
    <input type="hidden" name={name} value={value} />
    <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-between px-3 py-2 text-left font-normal" onClick={() => setOpen((current) => !current)}>
      <span className="min-w-0">
        <span className="block truncate">{selected ? displayName(selected) : rootLabel}</span>
        {selected ? <span className="block truncate text-xs text-muted-foreground">{organizationMeta(selected)}</span> : null}
      </span>
      <ChevronDown className={cn("size-4 shrink-0 transition", open && "rotate-180")} />
    </Button>

    {open ? <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-white shadow-xl">
      <div className="border-b p-3">
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, division or district" className="pl-9 pr-9" />{query ? <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button> : null}</div>
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        <button type="button" onClick={() => choose("")} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50", value === "" && "bg-emerald-50 text-emerald-800")}>
          <span className="flex size-7 items-center justify-center rounded-md bg-slate-100"><Building2 className="size-4" /></span><span className="flex-1">{rootLabel}</span>{value === "" ? <Check className="size-4" /> : null}
        </button>
        {visible.map((item) => <button key={item.public_id} type="button" onClick={() => choose(item.public_id)} className={cn("flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm hover:bg-slate-50", value === item.public_id && "bg-emerald-50 text-emerald-800")} style={{ paddingLeft: `${12 + item.depth * 22}px` }}>
          <span className="text-muted-foreground">{item.depth ? "└─" : "●"}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{displayName(item)}</span><span className="block truncate text-xs text-muted-foreground">{organizationMeta(item)}</span></span>
          {value === item.public_id ? <Check className="size-4 shrink-0" /> : null}
        </button>)}
        {!visible.length ? <p className="p-5 text-center text-sm text-muted-foreground">No matching organization found.</p> : null}
      </div>
    </div> : null}
    {help ? <span className="text-xs font-normal text-muted-foreground">{help}</span> : null}
  </div>
}
