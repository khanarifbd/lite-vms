"use client"

import type { LucideIcon } from "lucide-react"
import {
  Bell,
  Building2,
  CarFront,
  ChevronDown,
  CircleUserRound,
  FileCheck2,
  Gauge,
  LockKeyhole,
  Menu,
  RadioTower,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { LogoutButton } from "@/components/auth/logout-button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { USER_ROLES, userHasAnyRole, userHasRole } from "@/lib/auth/roles"
import type { AuthUser } from "@/lib/auth/types"
import { cn } from "@/lib/utils"

type ProviderShellProps = {
  user: AuthUser
  children: ReactNode
}

type NavItem = {
  label: string
  href?: string
  icon: LucideIcon
  soon?: boolean
  adminOnly?: boolean
  roles?: readonly string[]
}

const providerVehicleRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsTechnical,
  USER_ROLES.vtsViewer,
] as const

const providerVehicleRegistrationRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
] as const

const navigation: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Provider workspace",
    items: [
      { label: "Dashboard", href: "/provider/dashboard", icon: Gauge },
      {
        label: "Company information",
        href: "/provider/application",
        icon: FileCheck2,
        adminOnly: true,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Vehicle owners",
        href: "/provider/owners",
        icon: UsersRound,
        roles: [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator, USER_ROLES.vtsViewer],
      },
      {
        label: "Vehicles",
        href: "/provider/vehicles",
        icon: CarFront,
        roles: providerVehicleRoles,
      },
      {
        label: "Register vehicle",
        href: "/provider/vehicles/register",
        icon: CarFront,
        roles: providerVehicleRegistrationRoles,
      },
      {
        label: "Telemetry integration",
        href: "/provider/integration",
        icon: RadioTower,
        roles: providerVehicleRoles,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Provider staff",
        href: "/provider/staff",
        icon: Building2,
        adminOnly: true,
      },
      { label: "Settings", href: "/provider/settings", icon: Settings },
    ],
  },
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-950/20">
        <ShieldCheck aria-hidden="true" className="size-6" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
          AutoGeneration LTD
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-white">CMS Portal</p>
      </div>
    </div>
  )
}

function Navigation({ user, mobile = false }: { user: AuthUser; mobile?: boolean }) {
  const pathname = usePathname()
  const isAdmin = userHasRole(user, USER_ROLES.vtsAdmin)
  const isApplicant = userHasRole(user, USER_ROLES.vtsApplicant)

  return (
    <nav className="flex-1 space-y-7 overflow-y-auto px-4 py-6">
      {navigation.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon
              const roleAllowed = !item.roles || userHasAnyRole(user, item.roles)
              const adminAllowed =
                !item.adminOnly ||
                isAdmin ||
                (item.href === "/provider/application" && isApplicant)
              const allowed = roleAllowed && adminAllowed

              if (!item.href || !allowed) {
                return (
                  <div
                    key={item.label}
                    className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-emerald-100/45"
                  >
                    <Icon className="size-4.5" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    {item.soon ? (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wider">
                        Soon
                      </span>
                    ) : item.adminOnly || item.roles ? (
                      <LockKeyhole className="size-3.5" aria-hidden="true" />
                    ) : null}
                  </div>
                )
              }

              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              const link = (
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-white text-emerald-950 shadow-sm"
                      : "text-emerald-50/75 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="size-4.5" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              )

              return mobile ? (
                <SheetClose key={item.label} asChild>
                  {link}
                </SheetClose>
              ) : (
                <div key={item.label}>{link}</div>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function SidebarFooter({ user }: { user: AuthUser }) {
  return (
    <div className="border-t border-white/10 p-4">
      <Link
        href="/provider/settings?tab=account"
        className="mb-3 flex items-center gap-3 rounded-2xl bg-white/7 p-3 transition hover:bg-white/12"
      >
        <Avatar className="size-10 border border-white/10">
          <AvatarFallback className="bg-emerald-700 text-sm font-semibold text-white">
            {initials(user.display_name) || "VP"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.display_name}</p>
          <p className="truncate text-xs text-emerald-100/55">
            {user.email || user.username || "VTS provider account"}
          </p>
        </div>
        <Settings className="size-4 text-emerald-100/60" />
      </Link>
      <LogoutButton />
    </div>
  )
}

function MobileSidebar({ user }: { user: AuthUser }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden">
          <Menu aria-hidden="true" />
          <span className="sr-only">Open provider navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[88%] max-w-72 gap-0 border-r-0 bg-emerald-950 p-0 text-white"
      >
        <SheetHeader className="border-b border-white/10 px-5 py-5 text-left">
          <SheetTitle className="sr-only">VTS provider navigation</SheetTitle>
          <SheetDescription className="sr-only">
            AutoGeneration LTD CMS Portal provider workspace
          </SheetDescription>
          <Brand />
        </SheetHeader>
        <Navigation user={user} mobile />
        <SidebarFooter user={user} />
      </SheetContent>
    </Sheet>
  )
}

export function ProviderShell({ user, children }: ProviderShellProps) {
  return (
    <div className="min-h-screen bg-slate-100/70">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col bg-emerald-950 lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <Brand />
        </div>
        <Navigation user={user} />
        <SidebarFooter user={user} />
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur-xl">
          <div className="flex h-17 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <MobileSidebar user={user} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">VTS Provider</p>
              <p className="truncate text-sm font-semibold text-foreground">
                AutoGeneration LTD CMS Portal
              </p>
            </div>
            <Badge
              variant="outline"
              className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:inline-flex"
            >
              <span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" />
              Secure session
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell aria-hidden="true" />
                  <span className="sr-only">Notifications</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Provider notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/provider/dashboard">Review dashboard alerts</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/provider/integration">Check telemetry connection</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 px-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-emerald-100 text-xs font-semibold text-emerald-800">
                      {initials(user.display_name) || "VP"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-36 truncate text-sm font-medium sm:block">
                    {user.display_name}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <p className="font-medium">{user.display_name}</p>
                  <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">
                    {user.email || user.username || "VTS provider account"}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/provider/settings?tab=account">
                    <CircleUserRound aria-hidden="true" /> My account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/provider/settings?tab=organization">
                    <Settings aria-hidden="true" /> Provider settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/provider/settings?tab=security">
                    <LockKeyhole aria-hidden="true" /> Security
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
