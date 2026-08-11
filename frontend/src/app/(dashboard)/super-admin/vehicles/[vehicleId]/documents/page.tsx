import { ArrowLeft, ClipboardCheck, FileCheck2, RadioTower } from "lucide-react"
import Link from "next/link"

import { AdminVehicleDocumentsView } from "@/components/super-admin/admin-vehicle-documents-view"
import { VehicleWorkspaceHero } from "@/components/vehicles/vehicle-workspace-hero"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { getAdminVehicle } from "@/features/super-admin/vehicle-review"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ vehicleId: string }> }

export default async function SuperAdminVehicleDocumentsPage({ params }: Props) {
  const { vehicleId } = await params
  const detail = await getAdminVehicle(vehicleId)
  const { vehicle } = detail
  const registration = vehicle.registration_number_display || vehicle.registration_number
  const pendingDocuments = vehicle.documents.filter(
    (document) => document.status === "pending_verification"
  )
  const reviewHref = `/super-admin/approvals?entity=document&status=pending&q=${encodeURIComponent(registration)}`

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <VehicleWorkspaceHero
          eyebrow="National document oversight"
          title="Vehicle documents"
          description={
            <>
              {registration} · Review registration, fitness, tax token, insurance, and route permit
              files with expiry, verification, and replacement history.
            </>
          }
          actions={
            <>
              <Button asChild variant="secondary">
                <Link href={`/super-admin/vehicles/${vehicle.id}`}>
                  <ArrowLeft /> Vehicle overview
                </Link>
              </Button>
              <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                <Link href={`/super-admin/vehicles/${vehicle.id}/tracking`}>
                  <RadioTower /> GPS & tracking
                </Link>
              </Button>
              {pendingDocuments.length ? (
                <Button asChild className="bg-amber-300 text-amber-950 hover:bg-amber-200">
                  <Link href={reviewHref}>
                    <ClipboardCheck /> Review {pendingDocuments.length} pending
                  </Link>
                </Button>
              ) : null}
            </>
          }
        />

        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <FileCheck2 />
          <AlertTitle>
            {pendingDocuments.length
              ? `${pendingDocuments.length} document update${pendingDocuments.length === 1 ? "" : "s"} awaiting review`
              : "Read-only national document record"}
          </AlertTitle>
          <AlertDescription>
            {pendingDocuments.length ? (
              <>
                The vehicle remains verified while the submitted replacement is reviewed. Use the
                review button to approve, reject, or request changes for the document only.
              </>
            ) : (
              <>
                Super Admin can view active and replaced document versions, verification state,
                expiry status, and secure files. Upload and replacement remain with the authorized
                owner or VTS provider workflow.
              </>
            )}
          </AlertDescription>
        </Alert>

        <AdminVehicleDocumentsView documents={vehicle.documents} />
      </div>
    </div>
  )
}
