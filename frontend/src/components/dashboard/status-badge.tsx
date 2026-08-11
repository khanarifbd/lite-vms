import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusBadgeProps = {
  status: string | null | undefined
  className?: string
}

const statusStyles: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  verified: "border-emerald-200 bg-emerald-50 text-emerald-700",
  online: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  pending_verification: "border-amber-200 bg-amber-50 text-amber-700",
  under_review: "border-sky-200 bg-sky-50 text-sky-700",
  changes_requested: "border-orange-200 bg-orange-50 text-orange-700",
  suspended: "border-rose-200 bg-rose-50 text-rose-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  disabled: "border-slate-200 bg-slate-100 text-slate-600",
  locked: "border-rose-200 bg-rose-50 text-rose-700",
}

function labelForStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status?.toLowerCase() || "unknown"

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        statusStyles[normalized] || "border-slate-200 bg-slate-50 text-slate-600",
        className
      )}
    >
      {labelForStatus(normalized)}
    </Badge>
  )
}
