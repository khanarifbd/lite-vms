import {
  Activity,
  CarFront,
  LockKeyhole,
  MapPinned,
  RadioTower,
  Search,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import { LoginMotionBackground } from "@/components/auth/login-motion-background"
import { Button } from "@/components/ui/button"
import { env } from "@/config/env"
import { dashboardPathForUser } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"

const platformHighlights = [
  {
    icon: MapPinned,
    title: "Nationwide vehicle visibility",
    description: "Monitor authorized vehicles from one central platform.",
  },
  {
    icon: RadioTower,
    title: "Live operational awareness",
    description: "Prepare for real-time location, status, and alert workflows.",
  },
  {
    icon: LockKeyhole,
    title: "Role-based secure access",
    description: "Controlled access across police administration levels.",
  },
]

const registrationOptions = [
  {
    href: "/register/vehicle-owner",
    label: "Vehicle Owner",
    description: "Register owner account",
    icon: CarFront,
  },
]

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const user = await getAuthenticatedUser()
  if (user) redirect(user.must_change_password ? "/change-password" : dashboardPathForUser(user))

  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_18%_10%,_#0f766e_0,_#064e3b_38%,_#022c22_100%)] lg:h-dvh lg:grid-cols-[1.06fr_0.94fr]">
      <LoginMotionBackground />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,44,34,.08)_0%,rgba(2,44,34,.25)_46%,rgba(2,44,34,.48)_100%)]" />
      <div className="pointer-events-none absolute -right-24 top-1/2 size-[34rem] -translate-y-1/2 rounded-full bg-cyan-100/10 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-[-14rem] right-[12%] size-[34rem] rounded-full bg-emerald-300/10 blur-[120px]" />

      <section className="relative z-10 hidden h-dvh px-10 py-8 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-10 2xl:px-20">
        <div className="absolute -left-24 top-24 size-72 rounded-full border border-white/10" />
        <div className="absolute -left-8 top-40 size-72 rounded-full border border-white/10" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-xl backdrop-blur xl:size-14">
            <ShieldCheck className="size-7 xl:size-8" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-200 xl:text-sm">
              AutoGeneration LTD
            </p>
            <h1 className="mt-1 max-w-xl text-xl font-semibold tracking-tight xl:text-2xl">
              CMS Portal
            </h1>
          </div>
        </div>

        <div className="relative z-10 my-auto max-w-2xl py-6 xl:py-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-emerald-100 shadow-lg shadow-emerald-950/20 backdrop-blur-xl xl:text-sm">
            <Activity className="size-4" /> Centralized command and monitoring
          </div>
          <h2 className="max-w-[650px] text-4xl font-semibold leading-[1.12] tracking-tight drop-shadow-sm xl:text-[2.8rem] 2xl:text-5xl">
            Secure visibility for coordinated vehicle operations.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-emerald-100/80 xl:text-base xl:leading-7">
            A unified platform foundation for vehicle registration, live tracking, alerts,
            operational history, and administrative oversight.
          </p>

          <div className="mt-6 grid gap-3 xl:mt-8">
            {platformHighlights.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex gap-3 rounded-2xl border border-white/10 bg-emerald-950/35 px-4 py-3 shadow-lg shadow-emerald-950/15 backdrop-blur-xl transition duration-300 hover:border-emerald-200/20 hover:bg-white/10"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-200">
                  <Icon className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-medium xl:text-base">{title}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-emerald-100/70 xl:text-sm">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[10px] uppercase tracking-[0.18em] text-emerald-200/60 xl:text-xs">
          Authorized personnel only
        </p>
      </section>

      <section className="relative z-10 flex min-h-dvh items-center justify-center overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:h-dvh lg:min-h-0 lg:overflow-hidden lg:px-10 lg:py-5 xl:px-12">
        <div className="pointer-events-none absolute inset-y-[8%] left-[5%] right-[5%] rounded-[3rem] border border-white/5 bg-white/[0.025] shadow-[0_0_100px_rgba(103,232,249,.08)] backdrop-blur-[2px]" />

        <div className="relative w-full max-w-[460px]">
          <div className="mb-4 flex items-center gap-3 text-white lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur-xl">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                AutoGeneration LTD
              </p>
              <p className="text-sm font-medium">CMS Portal</p>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/45 bg-white/[0.96] p-5 shadow-[0_28px_90px_rgba(2,44,34,.38)] backdrop-blur-2xl sm:p-6 xl:p-7">
            <div className="mb-5">
              <p className="text-xs font-medium text-emerald-700 sm:text-sm">Secure access</p>
              <h2 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-[1.7rem]">
                Welcome back
              </h2>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground sm:text-sm">
                Sign in with your username, email, or mobile number.
              </p>
            </div>

            <LoginForm />

            <div className="my-3.5 flex items-center gap-3 text-[9px] uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">
              <span className="h-px flex-1 bg-border" />
              First registration
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-2">
              {registrationOptions.map(({ href, label, description, icon: Icon }) => (
                <Button
                  key={href}
                  asChild
                  variant="outline"
                  className="h-14 justify-start gap-3 rounded-xl bg-emerald-50/70 px-3 py-2 hover:bg-emerald-100/80"
                >
                  <Link href={href}>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-left leading-tight">
                      <span className="block whitespace-normal text-sm font-semibold leading-4">
                        {label}
                      </span>
                      <span className="mt-1 block whitespace-normal text-[10px] font-normal leading-3 text-muted-foreground">
                        {description}
                      </span>
                    </span>
                  </Link>
                </Button>
              ))}
            </div>

            <Button
              asChild
              variant="outline"
              className="mt-3 h-11 w-full justify-center gap-2 rounded-xl border-cyan-200 bg-cyan-50/80 text-cyan-900 hover:bg-cyan-100 hover:text-cyan-950"
            >
              <Link href="/verify/certificate">
                <Search className="size-4" />
                <span className="font-semibold">Verify certificate</span>
                <span className="text-xs font-normal text-muted-foreground">by certificate number</span>
              </Link>
            </Button>
          </div>

          <p className="mt-3 text-center text-[10px] leading-4 text-emerald-100/70 sm:text-[11px]">
            {env.appName}. Access attempts may be recorded for security and audit purposes.
          </p>
        </div>
      </section>
    </main>
  )
}
