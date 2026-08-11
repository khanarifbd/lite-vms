"use client"

import type { LucideIcon } from "lucide-react"
import {
  Bell,
  Building2,
  CarFront,
  ChevronDown,
  ClipboardCheck,
  FileClock,
  Gauge,
  LayoutDashboard,
  Map,
  MapPinned,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  UsersRound,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"

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
import type { AuthUser } from "@/lib/auth/types"
import { cn } from "@/lib/utils"

type SuperAdminShellProps = { user: AuthUser; children: ReactNode }
type NavigationItem = {
  label: string
  href?: string
  icon: LucideIcon
  soon?: boolean
  exact?: boolean
  activePaths?: string[]
}

const SIDEBAR_STORAGE_KEY = "bnvp:super-admin-sidebar-collapsed"

const navigation: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Command center",
    items: [
      { label: "Overview", href: "/super-admin/dashboard", icon: LayoutDashboard, exact: true },
      { label: "Approval queue", href: "/super-admin/approvals", icon: ClipboardCheck },
      { label: "Live tracking", href: "/super-admin/monitoring", icon: MapPinned },
      { label: "Live tracking map", href: "/super-admin/live-tracking-map", icon: Map },
    ],
  },
  {
    label: "Document oversight",
    items: [
      {
        label: "Vehicle documents",
        href: "/super-admin/vehicle-documents",
        icon: FileClock,
      },
    ],
  },
  {
    label: "Traffic enforcement",
    items: [
      {
        label: "Enforcement dashboard",
        href: "/super-admin/enforcement",
        icon: ShieldAlert,
        exact: true,
      },
      {
        label: "Enforcement rules",
        href: "/super-admin/enforcement/speed-rules",
        icon: Gauge,
        activePaths: [
          "/super-admin/enforcement/policies",
          "/super-admin/enforcement/geofences",
          "/super-admin/enforcement/speed-rules",
        ],
      },
      {
        label: "Review queue",
        href: "/super-admin/enforcement/review-queue",
        icon: ClipboardCheck,
      },
      { label: "Cases", href: "/super-admin/enforcement/cases", icon: ShieldCheck },
      { label: "Vehicle exceptions", href: "/super-admin/enforcement/exceptions", icon: CarFront },
      { label: "Enforcement history", href: "/super-admin/audit-logs", icon: FileClock },
    ],
  },
  {
    label: "National registry",
    items: [
      { label: "VTS providers", href: "/super-admin/providers", icon: Network },
      { label: "Vehicle owners", href: "/super-admin/owners", icon: Building2 },
      { label: "Vehicles", href: "/super-admin/vehicles", icon: CarFront },
      { label: "Drivers", href: "/super-admin/drivers", icon: Gauge },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "User management", href: "/super-admin/staff", icon: UsersRound },
      { label: "Organizations", href: "/super-admin/organizations", icon: Building2 },
      { label: "Roles & permissions", icon: UserCog, soon: true },
      { label: "Audit logs", href: "/super-admin/audit-logs", icon: FileClock },
      { label: "System settings", href: "/super-admin/settings", icon: Settings },
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

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-950/20">
        <ShieldCheck aria-hidden="true" className="size-6" />
      </div>
      {!collapsed ? (
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
            Bangladesh Police
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">
            Vehicle Tracking Platform
          </p>
        </div>
      ) : null}
    </div>
  )
}

function subscribeToHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange)
  window.addEventListener("popstate", onStoreChange)
  return () => {
    window.removeEventListener("hashchange", onStoreChange)
    window.removeEventListener("popstate", onStoreChange)
  }
}

function getHashSnapshot() {
  return window.location.hash
}

function getServerHashSnapshot() {
  return ""
}

function pathMatches(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`)
}

function isNavigationActive(pathname: string, hash: string, item: NavigationItem) {
  if (!item.href) return false
  if (item.activePaths?.some((path) => pathMatches(pathname, path))) return true

  const [path, fragment] = item.href.split("#")
  if (fragment) return pathname === path && hash === `#${fragment}`
  if (item.exact) return pathname === path && (hash === "" || hash === "#overview")
  return pathMatches(pathname, path)
}

function SidebarNavigation({
  mobile = false,
  collapsed = false,
}: {
  mobile?: boolean
  collapsed?: boolean
}) {
  const pathname = usePathname()
  const hash = useSyncExternalStore(subscribeToHash, getHashSnapshot, getServerHashSnapshot)

  return (
    <nav
      className={cn(
        "flex-1 overflow-y-auto py-6",
        collapsed ? "space-y-5 px-2" : "space-y-7 px-4",
      )}
    >
      {navigation.map((group) => (
        <div key={group.label}>
          {collapsed ? (
            <div className="mx-2 mb-2 h-px bg-white/10" aria-hidden="true" />
          ) : (
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">
              {group.label}
            </p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon
              if (!item.href) {
                return (
                  <div
                    key={item.label}
                    title={collapsed ? `${item.label}${item.soon ? " — Soon" : ""}` : undefined}
                    className={cn(
                      "flex cursor-not-allowed items-center rounded-xl py-2.5 text-sm text-emerald-100/45",
                      collapsed ? "justify-center px-2" : "gap-3 px-3",
                    )}
                  >
                    <Icon className="size-4.5 shrink-0" />
                    {!collapsed ? (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.soon ? (
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wider">
                            Soon
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="sr-only">{item.label}</span>
                    )}
                  </div>
                )
              }

              const disablePrefetch =
                item.href === "/super-admin/monitoring" ||
                item.href === "/super-admin/live-tracking-map"
              const active = isNavigationActive(pathname, hash, item)
              const link = (
                <Link
                  href={item.href}
                  prefetch={disablePrefetch ? false : undefined}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center rounded-xl py-2.5 text-sm transition-colors",
                    collapsed ? "justify-center px-2" : "gap-3 px-3",
                    active
                      ? "bg-white text-emerald-950 shadow-sm"
                      : "text-emerald-50/75 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="size-4.5 shrink-0" />
                  {collapsed ? <span className="sr-only">{item.label}</span> : <span>{item.label}</span>}
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

function SidebarFooter({ user, collapsed = false }: { user: AuthUser; collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 border-t border-white/10 p-3">
        <Avatar className="size-10 border border-white/10" title={user.display_name}>
          <AvatarFallback className="bg-emerald-700 text-sm font-semibold text-white">
            {initials(user.display_name) || "SA"}
          </AvatarFallback>
        </Avatar>
        <LogoutButton
          compact
          className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
        />
      </div>
    )
  }

  return (
    <div className="border-t border-white/10 p-4">
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/7 p-3">
        <Avatar className="size-10 border border-white/10">
          <AvatarFallback className="bg-emerald-700 text-sm font-semibold text-white">
            {initials(user.display_name) || "SA"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.display_name}</p>
          <p className="truncate text-xs text-emerald-100/55">
            {user.email || user.username || "Super administrator"}
          </p>
        </div>
      </div>
      <LogoutButton />
    </div>
  )
}

function MobileSidebar({ user }: { user: AuthUser }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden">
          <Menu />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88%] max-w-72 gap-0 border-r-0 bg-emerald-950 p-0 text-white">
        <SheetHeader className="border-b border-white/10 px-5 py-5 text-left">
          <SheetTitle className="sr-only">Super admin navigation</SheetTitle>
          <SheetDescription className="sr-only">
            National Vehicle Tracking Platform navigation
          </SheetDescription>
          <Brand />
        </SheetHeader>
        <SidebarNavigation mobile />
        <SidebarFooter user={user} />
      </SheetContent>
    </Sheet>
  )
}

export function SuperAdminShell({ user, children }: SuperAdminShellProps) {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarPreferenceLoaded, setSidebarPreferenceLoaded] = useState(false)

  useEffect(() => {
    const storedPreference = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    setSidebarCollapsed(
      storedPreference === null
        ? pathMatches(pathname, "/super-admin/live-tracking-map")
        : storedPreference === "true",
    )
    setSidebarPreferenceLoaded(true)
  }, [pathname])

  useEffect(() => {
    if (!sidebarPreferenceLoaded) return

    const notifyLayoutChange = () => window.dispatchEvent(new Event("bnvp:layout-resize"))
    const startTimer = window.setTimeout(notifyLayoutChange, 0)
    const finishTimer = window.setTimeout(notifyLayoutChange, 340)
    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(finishTimer)
    }
  }, [sidebarCollapsed, sidebarPreferenceLoaded])

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      return next
    })
  }

  return (
    <div className="min-h-screen bg-slate-100/70">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col bg-emerald-950 transition-[width] duration-300 ease-out lg:flex",
          sidebarCollapsed ? "w-20" : "w-72",
        )}
      >
        <div className={cn("border-b border-white/10 py-5", sidebarCollapsed ? "px-3" : "px-5")}>
          <Brand collapsed={sidebarCollapsed} />
        </div>
        <SidebarNavigation collapsed={sidebarCollapsed} />
        <SidebarFooter user={user} collapsed={sidebarCollapsed} />
      </aside>

      <div
        className={cn(
          "transition-[padding] duration-300 ease-out",
          sidebarCollapsed ? "lg:pl-20" : "lg:pl-72",
        )}
      >
        <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
            <MobileSidebar user={user} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="hidden size-9 lg:inline-flex"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">Super Admin</p>
              <p className="truncate text-sm font-semibold text-foreground">National Command Center</p>
            </div>
            <Badge
              variant="outline"
              className="hidden h-7 border-emerald-200 bg-emerald-50 px-2.5 text-[11px] text-emerald-700 sm:inline-flex"
            >
              <span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" />
              System online
            </Badge>
            <Button variant="ghost" size="icon" className="relative size-9">
              <Bell className="size-4" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-amber-500" />
              <span className="sr-only">Notifications</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 max-w-48 gap-1.5 rounded-xl px-1.5 sm:px-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-emerald-100 text-[10px] font-semibold text-emerald-800">
                      {initials(user.display_name) || "SA"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-28 truncate text-xs font-medium xl:block">
                    {user.display_name}
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-56 p-1.5">
                <DropdownMenuLabel className="px-2 py-1.5">
                  <p className="truncate text-xs font-semibold">{user.display_name}</p>
                  <p className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground">
                    {user.email || user.username || "Super administrator"}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem disabled className="h-8 gap-2 px-2 text-xs">
                  <UserCog className="size-3.5" />
                  Account settings
                  <span className="ml-auto text-[9px] uppercase tracking-wide text-muted-foreground">
                    Soon
                  </span>
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
