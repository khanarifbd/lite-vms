import { FileCheck2, ShieldAlert } from "lucide-react"
import { redirect } from "next/navigation"

import { OwnerProfileManager } from "@/components/owner/owner-profile-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import type { OwnerApplication, OwnerDocument } from "@/features/owner/types"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyOwnerApplication, getMyOwnerDocuments } from "@/lib/owner/server"

export const dynamic = "force-dynamic"

export default async function OwnerApplicationPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")

  let owner: OwnerApplication | null = null
  let documents: OwnerDocument[] = []
  let loadError: string | null = null

  try {
    ;[owner, documents] = await Promise.all([getMyOwnerApplication(), getMyOwnerDocuments()])
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The owner application service is unavailable."
  }

  if (!owner) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load owner application</AlertTitle>
            <AlertDescription>{loadError || "Owner application data is unavailable."}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (owner.submitted_at && owner.verification_status === "approved") {
    redirect("/owner/profile")
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              Application {owner.application_number}
            </Badge>
            <div className="mt-5 flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-200">
                <FileCheck2 className="size-6" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Vehicle owner application</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-100/75 sm:text-base">
                  Complete the individual or company profile, upload required documents, accept the declaration, and submit the application for Bangladesh Police review.
                </p>
              </div>
            </div>
          </div>
        </section>

        <OwnerProfileManager initialOwner={owner} initialDocuments={documents} />
      </div>
    </div>
  )
}
