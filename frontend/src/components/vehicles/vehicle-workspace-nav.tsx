"use client"

import { FileText, LayoutDashboard, QrCode, RadioTower, UsersRound } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"

type VehicleWorkspaceNavProps = {
  baseHref: string
  trackingLabel?: string
}

export function VehicleWorkspaceNav({
  baseHref,
  trackingLabel = "GPS & tracking",
}: VehicleWorkspaceNavProps) {
  const pathname = usePathname()
  const items = [
    { href: baseHref, label: "Vehicle overview", icon: LayoutDashboard },
    { href: `${baseHref}/documents`, label: "Documents", icon: FileText },
    { href: `${baseHref}/tracking`, label: trackingLabel, icon: RadioTower },
    { href: `${baseHref}/drivers`, label: "Drivers", icon: UsersRound },
    { href: `${baseHref}/qr`, label: "Vehicle QR", icon: QrCode },
  ]

  return (
    <div className="border-b bg-white px-4 py-3 sm:px-6 lg:px-8">
      <nav
        aria-label="Vehicle workspace"
        className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2"
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Button
              key={href}
              asChild
              size="sm"
              variant={active ? "default" : "outline"}
              className={
                active
                  ? "bg-emerald-800 text-white shadow-sm hover:bg-emerald-900"
                  : "border-cyan-200 bg-cyan-50/70 text-slate-800 hover:bg-cyan-100"
              }
            >
              <Link href={href} aria-current={active ? "page" : undefined}>
                <Icon /> {label}
              </Link>
            </Button>
          )
        })}
      </nav>
    </div>
  )
}
