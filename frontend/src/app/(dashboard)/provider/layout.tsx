import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { ProviderShell } from "@/components/provider/provider-shell"
import { VTS_WORKSPACE_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function ProviderLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/login")
  }
  if (user.must_change_password) {
    redirect("/change-password")
  }
  if (!userHasAnyRole(user, VTS_WORKSPACE_ROLES)) {
    redirect("/dashboard")
  }

  return <ProviderShell user={user}>{children}</ProviderShell>
}
