import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { OwnerShell } from "@/components/owner/owner-shell"
import { USER_ROLES, userHasRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/login")
  }
  if (user.must_change_password) {
    redirect("/change-password")
  }
  if (!userHasRole(user, USER_ROLES.vehicleOwner)) {
    redirect("/dashboard")
  }

  return <OwnerShell user={user}>{children}</OwnerShell>
}
