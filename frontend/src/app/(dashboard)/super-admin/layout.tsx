import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { SuperAdminShell } from "@/components/dashboard/super-admin-shell"
import { DocumentViewEnhancer } from "@/components/super-admin/document-view-enhancer"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { USER_ROLES, userHasRole } from "@/lib/auth/roles"

export const dynamic = "force-dynamic"

type SuperAdminLayoutProps = {
  children: ReactNode
}

export default async function SuperAdminLayout({
  children,
}: SuperAdminLayoutProps) {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/login")
  }

  if (user.must_change_password) {
    redirect("/change-password")
  }

  if (!userHasRole(user, USER_ROLES.superAdmin)) {
    redirect("/dashboard")
  }

  return (
    <SuperAdminShell user={user}>
      <DocumentViewEnhancer />
      {children}
    </SuperAdminShell>
  )
}
