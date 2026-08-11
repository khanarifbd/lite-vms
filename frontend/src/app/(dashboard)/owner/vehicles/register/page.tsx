import { ArrowLeft, CarFront, LockKeyhole, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { VehicleRegistrationForm } from "@/components/vehicle/vehicle-registration-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyOwnerApplication } from "@/lib/owner/server"

export const dynamic = "force-dynamic"

export default async function OwnerVehicleRegistrationPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, [USER_ROLES.vehicleOwner])) redirect("/owner/dashboard")

  const owner = await getMyOwnerApplication()
  if (!owner) redirect("/owner/profile")

  if (owner.verification_status !== "approved") {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <LockKeyhole />
            <AlertTitle>Vehicle registration is locked</AlertTitle>
            <AlertDescription>
              Bangladesh Police must approve your owner profile before you can add vehicles to the national registry.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href="/owner/profile"><ArrowLeft /> Review owner profile</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                Vehicle owner self-registration
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                Add your vehicle
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                Enter vehicle identity, technical, and compliance information, validate global duplicates, then save a draft or submit it to Bangladesh Police for review.
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/owner/vehicles"><ArrowLeft /> My vehicles</Link>
            </Button>
          </div>
        </section>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Verified owner registration</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The vehicle will be attached directly to your approved owner record. A provider connection is not required to register it.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <CarFront className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Police review workflow</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Saving a draft keeps it private in your workspace. Submitting sends the registration to the Bangladesh Police verification queue.
              </p>
            </div>
          </CardContent>
        </Card>

        <VehicleRegistrationForm
          mode="owner"
          apiBase="/api/owner/vehicles"
          registryHref="/owner/vehicles"
          fixedOwner={{
            id: owner.id,
            owner_name: owner.owner_name,
            owner_code: owner.owner_code,
            identity_reference: owner.identity_or_registration_reference,
            phone: owner.phone,
          }}
        />
      </div>
    </div>
  )
}
