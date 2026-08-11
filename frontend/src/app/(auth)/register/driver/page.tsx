import { ArrowLeft, FileCheck2, Gauge, IdCard, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { DriverSignupForm } from "@/components/auth/driver-signup-form"
import { Button } from "@/components/ui/button"
import { dashboardPathForUser } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"

const steps = [
  {
    icon: Gauge,
    title: "Create mobile account",
    description: "Register your required mobile number, email, password, and BRTA licence identity.",
  },
  {
    icon: IdCard,
    title: "Add NID for verification",
    description: "After mobile sign-in, enter the NID and upload NID, licence, and driver photo documents.",
  },
  {
    icon: FileCheck2,
    title: "Receive assignments",
    description: "After police verification, review owner/provider links and active vehicle assignments.",
  },
]

export const dynamic = "force-dynamic"

export default async function DriverRegistrationPage() {
  const user = await getAuthenticatedUser()
  if (user) redirect(user.must_change_password ? "/change-password" : dashboardPathForUser(user))

  return (
    <main className="min-h-dvh bg-slate-50 lg:grid lg:h-dvh lg:grid-cols-[0.82fr_1.18fr] lg:overflow-hidden">
      <section className="relative hidden h-dvh overflow-hidden bg-emerald-950 px-9 py-8 text-white lg:flex lg:flex-col lg:justify-between xl:px-14 xl:py-10">
        <div className="absolute -right-24 top-16 size-72 rounded-full border border-white/10" />
        <div className="absolute -right-8 top-32 size-72 rounded-full border border-white/10" />
        <div className="absolute -bottom-28 -left-20 size-80 rounded-full bg-emerald-700/20 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <ShieldCheck className="size-7" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-200">Bangladesh Police</p>
            <h1 className="mt-1 text-xl font-semibold xl:text-2xl">National Driver Portal</h1>
          </div>
        </div>

        <div className="relative z-10 my-auto py-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">Driver identity and safety</p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            Start with mobile access, then complete the verified driver identity.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-emerald-100/75">
            Your mobile number creates the first account. NID and verification documents are
            collected in the next protected application step.
          </p>

          <div className="mt-6 grid gap-3">
            {steps.map(({ icon: Icon, title, description }, index) => (
              <div key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-200">
                  <Icon className="size-4" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-300">Step {index + 1}</p>
                  <h3 className="mt-0.5 text-sm font-medium xl:text-base">{title}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-emerald-100/65 xl:text-sm">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[10px] uppercase tracking-[0.18em] text-emerald-200/60 xl:text-xs">
          Driver access is subject to police verification
        </p>
      </section>

      <section className="min-h-dvh overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:h-dvh lg:min-h-0 lg:px-8 lg:py-5 xl:px-12">
        <div className="mx-auto flex min-h-full w-full max-w-2xl items-center">
          <div className="w-full">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link href="/login"><ArrowLeft /> Back to sign in</Link>
              </Button>
              <div className="flex items-center gap-2 lg:hidden">
                <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-900 text-white"><Gauge className="size-4" /></div>
                <span className="text-xs font-semibold text-emerald-900">Driver Portal</span>
              </div>
            </div>

            <div className="rounded-[1.75rem] border bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-6 xl:p-7">
              <div className="mb-5">
                <p className="text-xs font-medium text-emerald-700 sm:text-sm">Mobile-first driver registration</p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-[1.7rem]">Create your driver account</h2>
                <p className="mt-1.5 max-w-xl text-xs leading-5 text-muted-foreground sm:text-sm">
                  Your mobile number is required and will be used for login. NID is collected after sign-in.
                </p>
              </div>
              <DriverSignupForm />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
