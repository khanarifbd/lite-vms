"use client"

import type { LucideIcon } from "lucide-react"
import {
  Bell,
  CarFront,
  ChevronDown,
  CircleUserRound,
  FileClock,
  FileUser,
  Gauge,
  LockKeyhole,
  Menu,
  Network,
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
import type { AuthUser } from "@/lib/auth/types"
import { cn } from "@/lib/utils"

type OwnerShellProps = {
  user: AuthUser
  children: ReactNode
}

type NavigationItem = {
  label: string
  href: string
  icon: LucideIcon
  exact?: boolean
}

const navigation: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Owner workspace",
    items: [
      { label: "Dashboard", href: "/owner/dashboard", icon: Gauge, exact: true },
      { label: "My profile", href: "/owner/profile", icon: FileUser },
      { label: "Provider connections", href: "/owner/providers", icon: Network },
    ],
  },
  {
    label: "Vehicle operations",
    items: [
      { label: "My vehicles", href: "/owner/vehicles", icon: CarFront },
      { label: "Drivers", href: "/owner/drivers", icon: UsersRound },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Settings", href: "/owner/settings", icon: Settings }],
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
          Bangladesh Police
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-white">Vehicle Owner Portal</p>
      </div>
    </div>
  )
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()

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
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
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
                  <Icon aria-hidden="true" className="size-4.5" />
                  <span>{item.label}</span>
                </Link>
              )

              return mobile ? (
                <SheetClose key={item.label} asChild>{link}</SheetClose>
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
        href="/owner/settings?tab=account"
        className="mb-3 flex items-center gap-3 rounded-2xl bg-white/7 p-3 transition hover:bg-white/12"
      >
        <Avatar className="size-10 border border-white/10">
          <AvatarFallback className="bg-emerald-700 text-sm font-semibold text-white">
            {initials(user.display_name) || "VO"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.display_name}</p>
          <p className="truncate text-xs text-emerald-100/55">
            {user.email || user.mobile || user.username || "Vehicle owner"}
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
          <span className="sr-only">Open owner navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88%] max-w-72 gap-0 border-r-0 bg-emerald-950 p-0 text-white">
        <SheetHeader className="border-b border-white/10 px-5 py-5 text-left">
          <SheetTitle className="sr-only">Vehicle owner navigation</SheetTitle>
          <SheetDescription className="sr-only">
            National Vehicle Tracking Platform vehicle owner workspace
          </SheetDescription>
          <Brand />
        </SheetHeader>
        <Navigation mobile />
        <SidebarFooter user={user} />
      </SheetContent>
    </Sheet>
  )
}

export function OwnerShell({ user, children }: OwnerShellProps) {
  return (
    <div className="min-h-screen bg-slate-100/70">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col bg-emerald-950 lg:flex">
        <div className="border-b border-white/10 px-5 py-5"><Brand /></div>
        <Navigation />
        <SidebarFooter user={user} />
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur-xl">
          <div className="flex h-17 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <MobileSidebar user={user} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Vehicle Owner</p>
              <p className="truncate text-sm font-semibold text-foreground">National Vehicle Services</p>
            </div>
            <Badge variant="outline" className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:inline-flex">
              <span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" /> Secure session
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon"><Bell aria-hidden="true" /><span className="sr-only">Notifications</span></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Owner notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/owner/dashboard"><Gauge /> Review action center</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/owner/providers"><Network /> Provider requests</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/owner/drivers"><UsersRound /> Driver workspace</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/owner/vehicles"><FileClock /> Document expiry watch</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 px-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-emerald-100 text-xs font-semibold text-emerald-800">
                      {initials(user.display_name) || "VO"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{user.display_name}</span>
                  <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <p className="font-medium">{user.display_name}</p>
                  <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">
                    {user.email || user.mobile || user.username || "Vehicle owner"}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/owner/settings?tab=account"><CircleUserRound /> My account</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/owner/profile"><FileUser /> Owner profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/owner/settings?tab=security"><LockKeyhole /> Security</Link>
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
