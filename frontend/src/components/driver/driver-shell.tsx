"use client"

import {
  Bell,
  ChevronDown,
  ClipboardCheck,
  FileUser,
  Gauge,
  Link2,
  Menu,
  ShieldCheck,
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

const navigation = [
  { label: "Dashboard", href: "/driver/dashboard", icon: Gauge },
  { label: "My application", href: "/driver/application", icon: ClipboardCheck },
  { label: "My profile", href: "/driver/profile", icon: FileUser },
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
      <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-950/20">
        <Gauge className="size-6" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">AutoGeneration LTD</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-white">CMS Portal</p>
      </div>
    </div>
  )
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  return (
    <nav className="flex-1 overflow-y-auto px-4 py-6">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">Driver workspace</p>
      <div className="space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const link = (
            <Link href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors", active ? "bg-white text-emerald-950 shadow-sm" : "text-emerald-50/75 hover:bg-white/10 hover:text-white")}>
              <Icon className="size-4.5" />
              <span>{item.label}</span>
            </Link>
          )
          return mobile ? <SheetClose key={item.href} asChild>{link}</SheetClose> : <div key={item.href}>{link}</div>
        })}
      </div>
    </nav>
  )
}

function SidebarFooter({ user }: { user: AuthUser }) {
  return (
    <div className="border-t border-white/10 p-4">
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/7 p-3">
        <Avatar className="size-10 border border-white/10">
          <AvatarFallback className="bg-emerald-700 text-sm font-semibold text-white">{initials(user.display_name) || "DR"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.display_name}</p>
          <p className="truncate text-xs text-emerald-100/55">{user.mobile || user.email || user.username || "Registered driver"}</p>
        </div>
      </div>
      <LogoutButton />
    </div>
  )
}

function MobileSidebar({ user }: { user: AuthUser }) {
  return (
    <Sheet>
      <SheetTrigger asChild><Button variant="outline" size="icon" className="lg:hidden"><Menu /><span className="sr-only">Open driver navigation</span></Button></SheetTrigger>
      <SheetContent side="left" className="w-[88%] max-w-72 gap-0 border-r-0 bg-emerald-950 p-0 text-white">
        <SheetHeader className="border-b border-white/10 px-5 py-5 text-left">
          <SheetTitle className="sr-only">Driver navigation</SheetTitle>
          <SheetDescription className="sr-only">AutoGeneration LTD CMS Portal driver workspace</SheetDescription>
          <Brand />
        </SheetHeader>
        <Navigation mobile />
        <SidebarFooter user={user} />
      </SheetContent>
    </Sheet>
  )
}

export function DriverShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100/70">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col bg-emerald-950 lg:flex">
        <div className="border-b border-white/10 px-5 py-5"><Brand /></div>
        <Navigation />
        <SidebarFooter user={user} />
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
            <MobileSidebar user={user} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">Driver</p>
              <p className="truncate text-sm font-semibold">National Driver Services</p>
            </div>
            <Badge variant="outline" className="hidden h-7 border-emerald-200 bg-emerald-50 px-2.5 text-[11px] text-emerald-700 sm:inline-flex"><span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" /> Secure session</Badge>
            <Button variant="ghost" size="icon" className="relative size-9"><Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-amber-500" /><span className="sr-only">Notifications</span></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 max-w-48 gap-1.5 rounded-xl px-1.5 sm:px-2">
                  <Avatar className="size-7"><AvatarFallback className="bg-emerald-100 text-[10px] font-semibold text-emerald-800">{initials(user.display_name) || "DR"}</AvatarFallback></Avatar>
                  <span className="hidden max-w-32 truncate text-xs font-medium xl:block">{user.display_name}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel><p className="truncate text-sm font-medium">{user.display_name}</p><p className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground">{user.mobile || user.email || user.username}</p></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/driver/profile"><FileUser /> My profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/driver/application"><ClipboardCheck /> Application record</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/driver/dashboard"><Link2 /> Assignment links</Link></DropdownMenuItem>
                <DropdownMenuItem disabled><ShieldCheck /> Security settings</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
