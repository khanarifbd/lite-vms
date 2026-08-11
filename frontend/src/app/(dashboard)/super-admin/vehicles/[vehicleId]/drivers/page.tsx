import { ArrowLeft, BadgeCheck, Building2, IdCard, Phone, UserRound, UsersRound } from "lucide-react"
import Link from "next/link"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { VehicleWorkspaceHero } from "@/components/vehicles/vehicle-workspace-hero"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminVehicle } from "@/features/super-admin/vehicle-review"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ vehicleId: string }> }

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" })

function formatDate(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? "Not available" : dateFormatter.format(date)
}

function label(value: string | null) {
  return value ? value.replaceAll("_", " ") : "Not available"
}

export default async function SuperAdminVehicleDriversPage({ params }: Props) {
  const { vehicleId } = await params
  const { vehicle } = await getAdminVehicle(vehicleId)
  const registration = vehicle.registration_number_display || vehicle.registration_number
  const hasDriver = Boolean(vehicle.current_driver_id && vehicle.current_driver_name)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <VehicleWorkspaceHero
          eyebrow="National driver oversight"
          title="Vehicle drivers"
          icon={<UsersRound className="size-8" />}
          description={
            <>
              {registration} · Review the current assignment, duty state, driver identity, BRTA
              licence readiness, owner, and connected tracking provider.
            </>
          }
          actions={
            <Button asChild variant="secondary">
              <Link href={`/super-admin/vehicles/${vehicle.id}`}>
                <ArrowLeft /> Vehicle overview
              </Link>
            </Button>
          }
        />

        {!hasDriver ? (
          <Alert>
            <UserRound />
            <AlertTitle>No active driver assigned</AlertTitle>
            <AlertDescription>
              This vehicle currently has no active driver assignment. Vehicle Owner or the connected
              VTS Provider can assign an eligible owner-linked driver.
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-5 text-emerald-700" /> Current driver assignment
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                The active assignment attached to this vehicle record.
              </p>
            </CardHeader>
            <CardContent>
              {hasDriver ? (
                <div className="space-y-5">
                  <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-slate-50 p-5 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-xl font-semibold">{vehicle.current_driver_name}</p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        Driver ID: {vehicle.current_driver_id}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={vehicle.current_driver_assignment_status || "active"} />
                      {vehicle.current_driver_id ? (
                        <Button asChild size="sm">
                          <Link href={`/super-admin/drivers/${vehicle.current_driver_id}`}>
                            View driver profile
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border p-4">
                      <Phone className="size-4 text-cyan-700" />
                      <p className="mt-3 text-xs text-muted-foreground">Mobile</p>
                      <p className="mt-1 font-semibold">{vehicle.current_driver_mobile || "Not available"}</p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <IdCard className="size-4 text-cyan-700" />
                      <p className="mt-3 text-xs text-muted-foreground">Licence number</p>
                      <p className="mt-1 font-semibold">{vehicle.current_driver_licence_number || "Not available"}</p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <BadgeCheck className="size-4 text-cyan-700" />
                      <p className="mt-3 text-xs text-muted-foreground">Licence status</p>
                      <p className="mt-1 font-semibold capitalize">{label(vehicle.current_driver_licence_status)}</p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <IdCard className="size-4 text-cyan-700" />
                      <p className="mt-3 text-xs text-muted-foreground">Licence expiry</p>
                      <p className="mt-1 font-semibold">{formatDate(vehicle.current_driver_licence_expiry)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <p className="text-xs text-muted-foreground">Assignment reference</p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {vehicle.current_driver_assignment_id || "Not available"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-slate-50 p-10 text-center text-sm text-muted-foreground">
                  No active assignment record is available.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRound className="size-5 text-emerald-700" /> Vehicle owner
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{vehicle.owner.owner_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {vehicle.owner.owner_code || "Owner code pending"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{vehicle.owner.phone || "No mobile"}</p>
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link href={`/super-admin/owners/${vehicle.owner.id}`}>Open owner profile</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-5 text-emerald-700" /> Tracking provider
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{vehicle.tracking_provider_name || "Not connected"}</p>
                <p className="mt-1 text-xs text-muted-foreground capitalize">
                  Assignment: {label(vehicle.tracking_assignment_status)}
                </p>
                {vehicle.tracking_provider_id ? (
                  <Button asChild variant="outline" className="mt-4 w-full">
                    <Link href={`/super-admin/providers/${vehicle.tracking_provider_id}`}>
                      Open provider profile
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  )
}
