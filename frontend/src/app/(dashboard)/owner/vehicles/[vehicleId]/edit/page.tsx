import { ArrowLeft, LockKeyhole, Pencil } from "lucide-react"
import Link from "next/link"

import { VehicleEditForm } from "@/components/vehicle/vehicle-edit-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { VehicleDetails } from "@/features/vehicles/types"
import { getMyVehicleDetails } from "@/lib/owner/server"

export const dynamic = "force-dynamic"

const editableStatuses = new Set(["draft", "changes_requested"])

type OwnerVehicleEditPageProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function OwnerVehicleEditPage({ params }: OwnerVehicleEditPageProps) {
  const { vehicleId } = await params
  let vehicle: VehicleDetails | null = null
  let loadError: string | null = null

  try {
    vehicle = await getMyVehicleDetails(vehicleId)
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load the vehicle registration."
  }

  if (!vehicle) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <Alert variant="destructive">
            <AlertTitle>Unable to load vehicle registration</AlertTitle>
            <AlertDescription>{loadError || "Vehicle data is unavailable."}</AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href="/owner/vehicles"><ArrowLeft /> Return to my vehicles</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!editableStatuses.has(vehicle.verification_status)) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <LockKeyhole />
            <AlertTitle>This vehicle is read-only</AlertTitle>
            <AlertDescription>
              Only draft registrations or registrations where Bangladesh Police requested changes can be edited. Current status: {vehicle.verification_status.replaceAll("_", " ")}.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href={`/owner/vehicles/${vehicle.id}`}><ArrowLeft /> Return to vehicle details</Link>
          </Button>
        </div>
      </div>
    )
  }

  const registration = vehicle.registration_number_display || vehicle.registration_number

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                Owner vehicle correction workflow
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Edit {registration}</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                Update permitted registration, technical, compliance, and permit information, then save or resubmit it for Bangladesh Police review.
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link href={`/owner/vehicles/${vehicle.id}`}><ArrowLeft /> Vehicle details</Link>
            </Button>
          </div>
        </section>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <Pencil className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Owner-managed correction</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Your vehicle stays attached to your verified owner profile. Drafts and requested corrections can be edited directly without a VTS provider.
              </p>
            </div>
          </CardContent>
        </Card>

        <VehicleEditForm
          vehicle={vehicle}
          apiBase="/api/owner/vehicles"
          detailsBase="/owner/vehicles"
          mode="owner"
        />
      </div>
    </div>
  )
}
