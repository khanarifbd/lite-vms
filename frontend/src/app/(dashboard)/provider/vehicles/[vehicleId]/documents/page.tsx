import { ArrowLeft, FileCheck2, RadioTower, ShieldAlert } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { VehicleDocumentsManager } from "@/components/vehicle/vehicle-documents-manager"
import { VehicleWorkspaceHero } from "@/components/vehicles/vehicle-workspace-hero"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { ProviderVehicleDetails } from "@/features/provider/vehicle-detail-types"
import type { VehicleDocumentPage } from "@/features/vehicles/document-types"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getProviderVehicleDocuments } from "@/lib/provider/document-server"
import { getMyProviderApplication } from "@/lib/provider/server"
import { getProviderVehicleDetails } from "@/lib/provider/vehicle-server"

export const dynamic = "force-dynamic"

const vehicleReadRoles = [
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsTechnical,
  USER_ROLES.vtsViewer,
] as const
const vehicleManageRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator] as const

type ProviderVehicleDocumentsPageProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function ProviderVehicleDocumentsPage({
  params,
}: ProviderVehicleDocumentsPageProps) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, vehicleReadRoles)) redirect("/provider/dashboard")

  const application = await getMyProviderApplication()
  if (!application) redirect("/provider/application")
  if (application.status !== "approved") redirect("/provider/vehicles")

  const { vehicleId } = await params
  let vehicle: ProviderVehicleDetails | null = null
  let documents: VehicleDocumentPage | null = null
  let loadError: string | null = null
  try {
    const result = await Promise.all([
      getProviderVehicleDetails(vehicleId),
      getProviderVehicleDocuments(vehicleId, true),
    ])
    vehicle = result[0]
    documents = result[1]
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load vehicle documents."
  }

  if (!vehicle || !documents) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Unable to load vehicle documents</AlertTitle>
            <AlertDescription>
              {loadError || "Vehicle document data is unavailable."}
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href={`/provider/vehicles/${vehicleId}`}>
              <ArrowLeft /> Return to vehicle overview
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const registration = vehicle.registration_number_display || vehicle.registration_number
  const canManage = userHasAnyRole(user, vehicleManageRoles)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <VehicleWorkspaceHero
          eyebrow="Provider document workflow"
          title="Vehicle documents"
          description={
            <>
              {registration} · Upload or replace registration, fitness, tax token, insurance, and
              route permit files while tracking expiry and verification status.
            </>
          }
          actions={
            <>
              <Button asChild variant="secondary">
                <Link href={`/provider/vehicles/${vehicle.id}`}>
                  <ArrowLeft /> Vehicle overview
                </Link>
              </Button>
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                <Link href={`/provider/vehicles/${vehicle.id}/tracking`}>
                  <RadioTower /> GPS assignment
                </Link>
              </Button>
            </>
          }
        />

        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <FileCheck2 />
          <AlertTitle>Versioned and verification-aware documents</AlertTitle>
          <AlertDescription>
            Every replacement creates a new version. Provider uploads remain Pending Verification
            until an authorized reviewer verifies them; expired dates are shown separately.
          </AlertDescription>
        </Alert>

        <VehicleDocumentsManager
          vehicleLabel={registration}
          initialDocuments={documents}
          canManage={canManage}
          apiBase={`/api/provider/vehicles/${vehicle.id}/documents`}
          readOnlyDescription="VTS Technical and Viewer users can review and download documents. Admin or Operator access is required to upload or replace files."
        />
      </div>
    </div>
  )
}
