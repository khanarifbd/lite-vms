import { ArrowLeft, FileCheck2, RadioTower, ShieldAlert } from "lucide-react"
import Link from "next/link"

import { VehicleDocumentsManager } from "@/components/vehicle/vehicle-documents-manager"
import { VehicleWorkspaceHero } from "@/components/vehicles/vehicle-workspace-hero"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { VehicleDocumentPage } from "@/features/vehicles/document-types"
import type { VehicleDetails } from "@/features/vehicles/types"
import {
  getMyOwnerApplication,
  getMyVehicleDetails,
  getOwnerVehicleDocuments,
} from "@/lib/owner/server"

export const dynamic = "force-dynamic"

type OwnerVehicleDocumentsPageProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function OwnerVehicleDocumentsPage({
  params,
}: OwnerVehicleDocumentsPageProps) {
  const { vehicleId } = await params
  let vehicle: VehicleDetails | null = null
  let documents: VehicleDocumentPage | null = null
  let canManage = false
  let loadError: string | null = null

  try {
    const [owner, vehicleResult, documentResult] = await Promise.all([
      getMyOwnerApplication(),
      getMyVehicleDetails(vehicleId),
      getOwnerVehicleDocuments(vehicleId, true),
    ])
    vehicle = vehicleResult
    documents = documentResult
    canManage = owner.verification_status === "approved"
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
            <Link href={`/owner/vehicles/${vehicleId}`}>
              <ArrowLeft /> Return to vehicle overview
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const registration = vehicle.registration_number_display || vehicle.registration_number

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <VehicleWorkspaceHero
          eyebrow="Owner document workflow"
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
                <Link href={`/owner/vehicles/${vehicle.id}`}>
                  <ArrowLeft /> Vehicle overview
                </Link>
              </Button>
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                <Link href={`/owner/vehicles/${vehicle.id}/tracking`}>
                  <RadioTower /> GPS tracking
                </Link>
              </Button>
            </>
          }
        />

        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <FileCheck2 />
          <AlertTitle>Versioned and verification-aware documents</AlertTitle>
          <AlertDescription>
            Every replacement creates a new version. Owner uploads remain Pending Verification
            until an authorized reviewer verifies them; expired dates are shown separately.
          </AlertDescription>
        </Alert>

        <VehicleDocumentsManager
          vehicleLabel={registration}
          initialDocuments={documents}
          canManage={canManage}
          apiBase={`/api/owner/vehicles/${vehicle.id}/documents`}
          readOnlyDescription="Your owner account can review and download documents, but an approved owner profile is required to upload or replace files."
        />
      </div>
    </div>
  )
}
