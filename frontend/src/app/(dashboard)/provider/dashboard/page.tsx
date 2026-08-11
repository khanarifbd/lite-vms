import {
  Activity,
  ArrowRight,
  Building2,
  CarFront,
  CheckCircle2,
  Clock3,
  FileCheck2,
  RadioTower,
  ShieldAlert,
  UsersRound,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { USER_ROLES, userHasAnyRole, userHasRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { getMyProviderApplication } from "@/lib/provider/server"

export const dynamic = "force-dynamic"

const statusCopy = {
  pending: {
    label: "Pending review",
    description: "Your company application is waiting for Bangladesh Police review.",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  under_review: {
    label: "Under review",
    description: "Review officers are currently checking the submitted information.",
    className: "border-blue-200 bg-blue-50 text-blue-800",
  },
  approved: {
    label: "Approved",
    description: "Your provider organization is approved for operational integration.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  rejected: {
    label: "Changes required",
    description: "Update the application using the review feedback and submit again.",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  suspended: {
    label: "Suspended",
    description: "Operational access is suspended. Contact the platform administrator.",
    className: "border-red-200 bg-red-50 text-red-800",
  },
} as const

export default async function ProviderDashboardPage() {
  const user = await getAuthenticatedUser()
  if (!user) {
    redirect("/login")
  }

  const canManageApplication = userHasAnyRole(user, [
    USER_ROLES.vtsApplicant,
    USER_ROLES.vtsAdmin,
  ])
  const canManageStaff = userHasRole(user, USER_ROLES.vtsAdmin)

  let application = null
  let loadError: string | null = null
  try {
    application = await getMyProviderApplication()
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load provider data."
  }

  if (!application) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {loadError ? (
            <Alert variant="destructive">
              <ShieldAlert />
              <AlertTitle>Provider service unavailable</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : null}

          <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10 lg:py-10">
            <div className="absolute -right-16 -top-20 size-72 rounded-full border border-white/10" />
            <div className="absolute -right-4 -top-8 size-72 rounded-full border border-white/10" />
            <div className="relative max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                VTS provider onboarding
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                Welcome, {user.display_name}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                Your applicant account is active. Complete the company application to join
                the national provider approval queue.
              </p>
              {canManageApplication ? (
                <Button asChild className="mt-7 bg-white text-emerald-950 hover:bg-emerald-50">
                  <Link href="/provider/application">
                    Start company application <ArrowRight />
                  </Link>
                </Button>
              ) : null}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Building2,
                title: "Company and licence",
                text: "BTRC licence, trade licence, company identity, and registered address.",
              },
              {
                icon: UsersRound,
                title: "Contacts and authority",
                text: "Authorized representative, technical, operations, support, and emergency contacts.",
              },
              {
                icon: RadioTower,
                title: "Integration readiness",
                text: "Coverage, protocols, device brands, server IPs, API endpoint, and capacity.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <Card key={title}>
                <CardHeader>
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="pt-3 text-lg">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">{text}</CardContent>
              </Card>
            ))}
          </section>
        </div>
      </div>
    )
  }

  const status = statusCopy[application.status]
  const approved = application.status === "approved"
  const editable = application.status === "pending" || application.status === "rejected"

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
                Application {application.application_number}
              </Badge>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                {application.legal_name}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
                Provider code {application.code} · {application.district}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Badge variant="outline" className={`${status.className} px-3 py-1.5`}>
                {status.label}
              </Badge>
              {canManageApplication ? (
                <Button asChild variant="secondary">
                  <Link href="/provider/application">
                    {editable ? "Review application" : "View application"} <ArrowRight />
                  </Link>
                </Button>
              ) : null}
              {approved && canManageStaff ? (
                <Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50">
                  <Link href="/provider/staff">
                    Manage team <UsersRound />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <Alert className={status.className}>
          {approved ? <CheckCircle2 /> : <Clock3 />}
          <AlertTitle>{status.label}</AlertTitle>
          <AlertDescription>{status.description}</AlertDescription>
        </Alert>

        {application.review_notes ? (
          <Alert variant={application.status === "rejected" ? "destructive" : "default"}>
            <FileCheck2 />
            <AlertTitle>Reviewer notes</AlertTitle>
            <AlertDescription>{application.review_notes}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Registered vehicles",
              value: application.active_vehicle_count,
              detail: `${application.online_vehicle_count} currently online`,
              icon: CarFront,
            },
            {
              title: "Linked owners",
              value: application.linked_owner_count,
              detail: "Customer organizations",
              icon: UsersRound,
            },
            {
              title: "Registered devices",
              value: application.registered_device_count,
              detail: "Tracking devices",
              icon: RadioTower,
            },
            {
              title: "Provider staff",
              value: application.provider_staff_count,
              detail: "Authorized team members",
              icon: Building2,
            },
          ].map(({ title, value, detail, icon: Icon }) => (
            <Card key={title}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className="mt-3 text-3xl font-semibold">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                  </div>
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Application readiness</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Verified documents</p>
                <p className="mt-2 text-2xl font-semibold">
                  {application.documents.filter((item) => item.status === "verified").length} / {application.documents.length}
                </p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Estimated fleet capacity</p>
                <p className="mt-2 text-2xl font-semibold">{application.estimated_vehicle_count.toLocaleString("en-US")}</p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Supported protocols</p>
                <p className="mt-2 font-medium">{application.supported_protocols.join(", ") || "Not supplied"}</p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Telemetry source</p>
                <p className="mt-2 font-medium capitalize">
                  {application.telemetry_source_status?.replaceAll("_", " ") || "Awaiting approval"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={approved ? "border-emerald-200 bg-emerald-950 text-white" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className={approved ? "text-emerald-300" : "text-amber-600"} />
                {approved ? "Integration access enabled" : "Operational access locked"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-sm leading-6 ${approved ? "text-emerald-100/75" : "text-muted-foreground"}`}>
                {approved
                  ? "Your provider is approved. Vehicle-owner linking, devices, telemetry integration, and staff access can now be activated."
                  : "Vehicle, customer, device, staff, and telemetry operations remain unavailable until the application is approved."}
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
