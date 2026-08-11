import {
  Activity,
  Building2,
  MapPinned,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react"
import { redirect } from "next/navigation"

import { LogoutButton } from "@/components/auth/logout-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { dashboardPathForUser } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

const upcomingModules = [
  "National vehicle registry",
  "Live vehicle tracking",
  "Operational alerts",
  "Role-based administration",
]

export default async function DashboardPage() {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/login")
  }

  if (user.must_change_password) {
    redirect("/change-password")
  }

  const roleDashboard = dashboardPathForUser(user)
  if (roleDashboard !== "/dashboard") {
    redirect(roleDashboard)
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-900 text-white">
              <ShieldCheck aria-hidden="true" className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
                AutoGeneration LTD
              </p>
              <h1 className="font-semibold">CMS Portal</h1>
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <Badge className="mb-3 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Secure session active
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Welcome, {user.display_name}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Your authenticated workspace is ready. A dedicated dashboard for your role
              will be added as the next platform module.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Last login:{" "}
            {user.last_login_at
              ? new Date(user.last_login_at).toLocaleString()
              : "Current session"}
          </p>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Account status</CardTitle>
              <UserRoundCheck className="size-5 text-emerald-700" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold capitalize">{user.status}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {user.email || user.mobile || user.username || "Verified platform account"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Primary role</CardTitle>
              <ShieldCheck className="size-5 text-emerald-700" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {user.primary_role?.replaceAll("_", " ") || "Assigned user"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Access is enforced by backend role memberships.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Primary organization</CardTitle>
              <Building2 className="size-5 text-emerald-700" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {user.primary_tenant_name || "National platform"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {user.memberships.length} active membership
                {user.memberships.length === 1 ? "" : "s"} available.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPinned className="size-5 text-emerald-700" aria-hidden="true" />
                Platform foundation
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {upcomingModules.map((module) => (
                <div
                  key={module}
                  className="rounded-xl border bg-slate-50 px-4 py-4 text-sm font-medium"
                >
                  {module}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-emerald-900/10 bg-emerald-950 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5 text-emerald-300" aria-hidden="true" />
                Authentication connected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-emerald-100/80">
                Login, secure session cookies, backend session validation, forced password
                change, and logout are handled through the FastAPI authentication API.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
