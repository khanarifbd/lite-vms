import { Download, Eye } from "lucide-react"

import { Button } from "@/components/ui/button"

type DocumentActionsProps = {
  storageKey: string
  fileName: string
  className?: string
}

function documentUrl(storageKey: string, fileName: string, download: boolean) {
  const params = new URLSearchParams({ storageKey, fileName })
  if (download) params.set("download", "1")
  return `/api/documents?${params.toString()}`
}

export function DocumentActions({ storageKey, fileName, className = "mt-3" }: DocumentActionsProps) {
  if (!storageKey) return null

  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <Button asChild size="sm" variant="outline">
        <a
          href={documentUrl(storageKey, fileName, false)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Eye /> View
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={documentUrl(storageKey, fileName, true)}>
          <Download /> Download
        </a>
      </Button>
    </div>
  )
}
