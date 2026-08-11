"use client"

import { Gauge, MapPinned, Scale } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const modules = [
  {
    label: "Violation policies",
    description: "Detection logic",
    href: "/super-admin/enforcement/policies",
    icon: Scale,
  },
  {
    label: "Geofences",
    description: "Reusable map areas",
    href: "/super-admin/enforcement/geofences",
    icon: MapPinned,
  },
  {
    label: "Speed rules",
    description: "Policy + area + authority",
    href: "/super-admin/enforcement/speed-rules",
    icon: Gauge,
  },
]

export function EnforcementModuleTabs() {
  const pathname = usePathname()

  return (
    <nav className="grid gap-2 rounded-2xl border bg-white p-2 shadow-sm sm:grid-cols-3">
      {modules.map(({ label, description, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 transition",
              active
                ? "bg-emerald-950 text-white shadow-sm"
                : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-950"
            )}
          >
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-white/10" : "bg-emerald-50 text-emerald-700")}>
              <Icon className="size-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{label}</span>
              <span className={cn("block truncate text-[11px]", active ? "text-emerald-100/70" : "text-muted-foreground")}>
                {description}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
