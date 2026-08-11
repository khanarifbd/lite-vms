import { FileCheck2, ShieldCheck } from "lucide-react"
import { redirect } from "next/navigation"

import { ProviderApplicationForm } from "@/components/provider/provider-application-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyProviderApplication } from "@/lib/provider/server"

export const dynamic = "force-dynamic"

export default async function ProviderApplicationPage() {
  const user = await getAuthenticatedUser()
  if (!user) {
    redirect("/login")
  }
  if (!userHasAnyRole(user, [USER_ROLES.vtsApplicant, USER_ROLES.vtsAdmin])) {
    redirect("/provider/dashboard")
  }

  let application = null
  let error: string | null = null

  try {
    application = await getMyProviderApplication()
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load provider application."
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              {application ? `Application ${application.application_number}` : "New VTS application"}
            </Badge>
            <div className="mt-5 flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-200">
                <FileCheck2 className="size-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  VTS provider company application
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-100/75 sm:text-base">
                  Submit legal identity, BTRC and trade licences, authorized contacts,
                  technical readiness, server information, and required documents for
                  national approval.
                </p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <Alert variant="destructive">
            <ShieldCheck />
            <AlertTitle>Provider application service unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <ProviderApplicationForm application={application} />
        )}
      </div>
    </div>
  )
}
