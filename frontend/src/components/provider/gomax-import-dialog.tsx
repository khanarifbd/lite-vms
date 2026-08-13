"use client"

import { Download, Loader2, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export type GoMaxProjectPreview = {
  project_id: string
  project_name: string
  already_imported: boolean
}

export type GoMaxImportPreview = {
  gomax_owner_id: string
  total: number
  available: number
  already_imported: number
  projects: GoMaxProjectPreview[]
}

type Props = {
  open: boolean
  preview: GoMaxImportPreview | null
  importing: boolean
  onOpenChange: (open: boolean) => void
  onImportAll: () => void
  onImportSelected: (projectIds: string[]) => void
}

export function GoMaxImportDialog({
  open,
  preview,
  importing,
  onOpenChange,
  onImportAll,
  onImportSelected,
}: Props) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) {
      setSelectionMode(false)
      setSearch("")
      setSelectedIds(new Set())
    }
  }, [open])

  const visibleProjects = useMemo(() => {
    if (!preview) return []
    const term = search.trim().toLowerCase()
    if (!term) return preview.projects
    return preview.projects.filter((project) =>
      `${project.project_name} ${project.project_id}`.toLowerCase().includes(term)
    )
  }, [preview, search])

  function resetAndClose(nextOpen: boolean) {
    if (importing) return
    onOpenChange(nextOpen)
  }

  function toggleProject(projectId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  function selectVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)
      visibleProjects.forEach((project) => {
        if (!project.already_imported) next.add(project.project_id)
      })
      return next
    })
  }

  return <Dialog open={open} onOpenChange={resetAndClose}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {preview ? `${preview.total} Go Max vehicle${preview.total === 1 ? "" : "s"} found` : "Go Max vehicles"}
        </DialogTitle>
        <DialogDescription>
          {preview
            ? `${preview.available} can be imported now. ${preview.already_imported} already exist in the VMS.`
            : "Review vehicles before importing."}
        </DialogDescription>
      </DialogHeader>

      {selectionMode && preview ? <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by vehicle name or project ID"
              className="pl-9"
            />
          </div>
          <Button type="button" variant="outline" onClick={selectVisible}>Select visible</Button>
          <Button type="button" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{visibleProjects.length} matching vehicles</span>
          <span>{selectedIds.size} selected</span>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-xl border">
          {visibleProjects.length ? visibleProjects.map((project) => (
            <label
              key={project.project_id}
              className={`flex items-center gap-3 border-b px-4 py-3 last:border-b-0 ${project.already_imported ? "cursor-not-allowed bg-muted/40 opacity-60" : "cursor-pointer hover:bg-muted/30"}`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(project.project_id)}
                disabled={project.already_imported}
                onChange={() => toggleProject(project.project_id)}
                className="size-4"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{project.project_name}</p>
                <p className="truncate text-xs text-muted-foreground">Project ID: {project.project_id}</p>
              </div>
              {project.already_imported ? <span className="text-xs font-medium text-muted-foreground">Already imported</span> : null}
            </label>
          )) : <p className="p-6 text-center text-sm text-muted-foreground">No vehicles match your search.</p>}
        </div>
      </div> : preview ? <div className="rounded-xl border bg-muted/20 p-4 text-sm">
        <p className="font-medium">Do you want to import all available vehicles or select specific vehicles?</p>
        <p className="mt-1 text-muted-foreground">Nothing will be imported until you confirm one of the options below.</p>
      </div> : null}

      <DialogFooter>
        {selectionMode ? <>
          <Button type="button" variant="outline" disabled={importing} onClick={() => setSelectionMode(false)}>Back</Button>
          <Button
            type="button"
            disabled={importing || selectedIds.size === 0}
            onClick={() => onImportSelected(Array.from(selectedIds))}
          >
            {importing ? <Loader2 className="animate-spin" /> : <Download />}
            Import selected ({selectedIds.size})
          </Button>
        </> : <>
          <Button type="button" variant="outline" disabled={importing} onClick={() => resetAndClose(false)}>Cancel</Button>
          <Button type="button" variant="outline" disabled={importing || !preview?.available} onClick={() => setSelectionMode(true)}>Select vehicles</Button>
          <Button type="button" disabled={importing || !preview?.available} onClick={onImportAll}>
            {importing ? <Loader2 className="animate-spin" /> : <Download />}
            Import all available
          </Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
