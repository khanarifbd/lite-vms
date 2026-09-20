import { ArrowLeft, Pencil } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { ProviderOwnerEditForm } from "@/components/provider/provider-owner-edit-form"
import { Button } from "@/components/ui/button"
import { USER_ROLES, userHasAnyRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { BackendApiError } from "@/lib/api/server"
import { getProviderOwnerDetails } from "@/lib/provider/owner-server"

const managementRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator] as const

export default async function ProviderOwnerEditPage({
  params,
}: {
  params: Promise<{ ownerId: string }>
}) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, managementRoles)) redirect("/provider/owners")
  const { ownerId } = await params
  let customer
  try {
    customer = await getProviderOwnerDetails(ownerId)
  } catch (error) {
    if (error instanceof BackendApiError && (error.status === 403 || error.status === 404)) notFound()
    throw error
  }
  if (!customer.can_manage) notFound()

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <Button asChild type="button" variant="outline" size="sm">
          <Link href={`/provider/owners/${ownerId}`}><ArrowLeft className="size-4" /> Owner profile</Link>
        </Button>
        <div>
          <p className="text-sm text-muted-foreground">Vehicle owner management</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            <Pencil className="size-5 text-emerald-800" /> Edit {customer.owner.owner_name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reuses the owner registration profile and account fields; updates are restricted to this provider's active-linked owner.
          </p>
        </div>
        <ProviderOwnerEditForm customer={customer} />
      </div>
    </div>
  )
}
