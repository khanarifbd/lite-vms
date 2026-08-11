import { KeyRound, ShieldCheck } from "lucide-react"
import { redirect } from "next/navigation"

import { ChangePasswordForm } from "@/components/auth/change-password-form"
import { getAuthenticatedUser } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function ChangePasswordPage() {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/login")
  }

  if (!user.must_change_password) {
    redirect("/dashboard")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-900 text-white">
            <ShieldCheck aria-hidden="true" className="size-7" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
              Bangladesh Police
            </p>
            <p className="font-medium">National Vehicle Tracking Platform</p>
          </div>
        </div>

        <section className="rounded-3xl border bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
          <div className="mb-7">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
              <KeyRound aria-hidden="true" className="size-6" />
            </div>
            <p className="text-sm font-medium text-emerald-700">Security requirement</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Change your password
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Hello {user.display_name}. Your administrator requires a new password before
              you can access the platform. Use at least 12 characters.
            </p>
          </div>

          <ChangePasswordForm />
        </section>

        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          Changing the password revokes the current session. You will need to sign in
          again.
        </p>
      </div>
    </main>
  )
}
