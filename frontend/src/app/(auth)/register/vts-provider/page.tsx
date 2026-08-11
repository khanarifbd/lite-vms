import { ArrowLeft, Building2, FileCheck2, RadioTower, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { VtsProviderSignupForm } from "@/components/auth/vts-provider-signup-form"
import { Button } from "@/components/ui/button"
import { dashboardPathForUser } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"

const steps = [
  {
    icon: Building2,
    title: "Create applicant account",
    description: "Register the primary administrator with official contact details.",
  },
  {
    icon: FileCheck2,
    title: "Submit company application",
    description: "Add licence, company, contact, technical, and document information.",
  },
  {
    icon: RadioTower,
    title: "Connect after approval",
    description: "Approved providers receive vehicle and telemetry workflow access.",
  },
]

export const dynamic = "force-dynamic"

export default async function VtsProviderRegistrationPage() {
  const user = await getAuthenticatedUser()
  if (user) {
    redirect(user.must_change_password ? "/change-password" : dashboardPathForUser(user))
  }

  return (
    <main className="min-h-dvh bg-slate-50 lg:grid lg:h-dvh lg:grid-cols-[0.82fr_1.18fr] lg:overflow-hidden">
      <section className="relative hidden h-dvh overflow-hidden bg-emerald-950 px-9 py-8 text-white lg:flex lg:flex-col lg:justify-between xl:px-14 xl:py-10">
        <div className="absolute -right-24 top-16 size-72 rounded-full border border-white/10" />
        <div className="absolute -right-8 top-32 size-72 rounded-full border border-white/10" />
        <div className="absolute -bottom-28 -left-20 size-80 rounded-full bg-emerald-700/20 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <ShieldCheck className="size-7" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-200">
              Bangladesh Police
            </p>
            <h1 className="mt-1 text-xl font-semibold xl:text-2xl">VTS Provider Onboarding</h1>
          </div>
        </div>

        <div className="relative z-10 my-auto py-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
            National integration gateway
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            Register your company for secure national vehicle integration.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-emerald-100/75">
            The account remains in a controlled applicant state until company, licence,
            contact, and technical information is reviewed.
          </p>

          <div className="mt-6 grid gap-3">
            {steps.map(({ icon: Icon, title, description }, index) => (
              <div
                key={title}
                className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-200">
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-300">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-0.5 text-sm font-medium xl:text-base">{title}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-emerald-100/65 xl:text-sm">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[10px] uppercase tracking-[0.18em] text-emerald-200/60 xl:text-xs">
          Provider access is subject to approval
        </p>
      </section>

      <section className="min-h-dvh overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:h-dvh lg:min-h-0 lg:px-8 lg:py-5 xl:px-12">
        <div className="mx-auto flex min-h-full w-full max-w-2xl items-center">
          <div className="w-full">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link href="/login">
                  <ArrowLeft /> Back to sign in
                </Link>
              </Button>

              <div className="flex items-center gap-2 lg:hidden">
                <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-900 text-white">
                  <Building2 className="size-4" />
                </div>
                <span className="text-xs font-semibold text-emerald-900">VTS Provider</span>
              </div>
            </div>

            <div className="rounded-[1.75rem] border bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-6 xl:p-7">
              <div className="mb-5">
                <p className="text-xs font-medium text-emerald-700 sm:text-sm">
                  Provider applicant registration
                </p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-[1.7rem]">
                  Create your account
                </h2>
                <p className="mt-1.5 max-w-xl text-xs leading-5 text-muted-foreground sm:text-sm">
                  Use the details of the person who will act as the primary administrator of
                  the VTS provider organization.
                </p>
              </div>
              <VtsProviderSignupForm />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
