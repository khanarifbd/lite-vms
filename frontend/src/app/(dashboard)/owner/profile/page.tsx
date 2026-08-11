import { ShieldAlert } from "lucide-react"

import { OwnerProfileManager } from "@/components/owner/owner-profile-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { OwnerApplication, OwnerDocument } from "@/features/owner/types"
import { getMyOwnerApplication, getMyOwnerDocuments } from "@/lib/owner/server"

export const dynamic = "force-dynamic"

export default async function OwnerProfilePage() {
  let owner: OwnerApplication | null = null
  let documents: OwnerDocument[] = []
  let loadError: string | null = null

  try {
    ;[owner, documents] = await Promise.all([getMyOwnerApplication(), getMyOwnerDocuments()])
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The owner profile service is unavailable."
  }

  if (!owner) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load owner profile</AlertTitle>
            <AlertDescription>{loadError || "Owner profile data is unavailable."}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <OwnerProfileManager initialOwner={owner} initialDocuments={documents} />
      </div>
    </div>
  )
}
