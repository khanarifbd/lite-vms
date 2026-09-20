import { ArrowLeft, Building2, KeyRound, Pencil, UserRound, UsersRound } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { ProviderOwnerPasswordReset } from "@/components/provider/provider-owner-password-reset"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { USER_ROLES, userHasAnyRole, userHasRole } from "@/lib/auth/roles"
import { getAuthenticatedUser } from "@/lib/auth/server"
import { BackendApiError } from "@/lib/api/server"
import { getProviderOwnerDetails } from "@/lib/provider/owner-server"

const readRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator, USER_ROLES.vtsViewer] as const
const manageRoles = [USER_ROLES.vtsAdmin, USER_ROLES.vtsOperator] as const

function show(value: string | number | null | undefined) {
  return value === null || value === undefined || String(value).trim() === ""
    ? "Not recorded"
    : String(value)
}

function DetailGrid({ items }: { items: [string, string | number | null | undefined][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-xl border bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-sm font-medium">{show(value)}</p>
        </div>
      ))}
    </div>
  )
}

export default async function ProviderOwnerDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ ownerId: string }>
  searchParams: Promise<{ updated?: string }>
}) {
  const user = await getAuthenticatedUser()
  if (!user) redirect("/login")
  if (!userHasAnyRole(user, readRoles)) redirect("/provider/dashboard")
  const { ownerId } = await params
  let customer
  try {
    customer = await getProviderOwnerDetails(ownerId)
  } catch (error) {
    if (error instanceof BackendApiError && (error.status === 404 || error.status === 403)) notFound()
    throw error
  }
  const { owner, link, account } = customer
  const { updated } = await searchParams
  const mayEdit = userHasAnyRole(user, manageRoles) && customer.can_manage
  const mayReset = userHasRole(user, USER_ROLES.vtsAdmin) && customer.can_reset_password

  return (
    <div className="px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild size="sm" variant="outline"><Link href="/provider/owners"><ArrowLeft className="size-4" /> Vehicle owners</Link></Button>
          {mayEdit ? (
            <Button asChild size="sm" className="bg-emerald-800 text-white hover:bg-emerald-900">
              <Link href={`/provider/owners/${owner.id}/edit`}><Pencil className="size-4" /> Edit profile</Link>
            </Button>
          ) : null}
        </div>
        {updated ? (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {updated === "review" ? "Owner updated. Legal details were submitted for reverification." : "Owner details saved successfully."}
          </div>
        ) : null}
        <Card>
          <CardHeader className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-100 p-3 text-emerald-800">
                {owner.owner_type === "company" ? <Building2 className="size-6" /> : <UserRound className="size-6" />}
              </div>
              <div>
                <CardTitle className="text-xl">{owner.owner_name}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{show(owner.owner_code)} · {show(owner.application_number)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={owner.verification_status} />
                  <StatusBadge status={link.status} />
                  <Badge variant="outline">{owner.owner_type}</Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <UsersRound className="size-4 text-emerald-800" /> {owner.active_vehicles} active / {owner.total_vehicles} vehicles
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader><CardTitle>Owner identity and contact</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <DetailGrid items={[
              ["Owner type", owner.owner_type],
              ["National identity / registration", owner.identity_or_registration_reference],
              ["Registered mobile", owner.phone],
              ["Email", owner.email],
              ["District", owner.district],
              ["Website", owner.website_url],
              ["Registered address", owner.registered_address],
              ["Application submitted", owner.submitted_at],
              ["National review date", owner.reviewed_at],
            ]} />
            {owner.review_notes ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Review notes: {owner.review_notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{owner.owner_type === "individual" ? "Personal details" : "Company details"}</CardTitle></CardHeader>
          <CardContent>
            <DetailGrid items={owner.owner_type === "individual" ? [
              ["Date of birth", owner.date_of_birth], ["Gender", owner.gender],
              ["Father's name", owner.father_name], ["Mother's name", owner.mother_name],
              ["Present address", owner.present_address], ["Permanent address", owner.permanent_address],
            ] : [
              ["Company type", owner.company_type], ["Incorporation date", owner.incorporation_date],
              ["Trade licence", owner.trade_license_number], ["TIN", owner.tin_number],
              ["BIN", owner.bin_number], ["Authorized person", owner.authorized_person_name],
              ["Authorized designation", owner.authorized_person_designation],
              ["Authorized mobile", owner.authorized_person_mobile], ["Authorized email", owner.authorized_person_email],
              ["Head office", owner.head_office_address], ["Operating address", owner.operating_address],
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Account and provider connection</CardTitle></CardHeader>
          <CardContent>
            <DetailGrid items={[
              ["Link status", link.status], ["Owner account", account?.status ?? owner.account_status],
              ["Account holder", account?.display_name], ["Username", account?.username ?? owner.account_username],
              ["Login email", account?.email], ["Login mobile", account?.mobile],
              ["Password change required", account ? account.must_change_password ? "Yes" : "No" : null],
              ["Last login", account?.last_login_at], ["Linked drivers", owner.linked_drivers_count],
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Owner documents</CardTitle>
            <p className="text-sm text-muted-foreground">Existing document metadata for this owner. {owner.documents.length} document(s) listed.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {owner.documents.length ? owner.documents.map((document) => (
              <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium capitalize">{document.document_type.replaceAll("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">{show(document.file_name)} · {show(document.document_reference)}</p>
                </div>
                <StatusBadge status={document.status} />
              </div>
            )) : <p className="text-sm text-muted-foreground">No documents uploaded.</p>}
          </CardContent>
        </Card>
        {mayReset ? <ProviderOwnerPasswordReset ownerId={owner.id} ownerName={owner.owner_name} /> : null}
        {userHasRole(user, USER_ROLES.vtsAdmin) && account && customer.can_manage && !customer.can_reset_password ? (
          <p className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
            This owner account was not registered by your provider. For security, its shared login password can be reset only through the registering provider or the owner's authorized account recovery.
          </p>
        ) : null}
      </div>
    </div>
  )
}
