"use client"

import { DdMmYyyyInput } from "@/components/ui/date-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { OwnerType, ProviderOwnerCustomer } from "@/features/provider/owner-types"

type Props = {
  ownerType: OwnerType
  mobile: string
  editOwner?: ProviderOwnerCustomer
}

/** Shared Create / Edit form fields; only account credentials differ by mode. */
export function ProviderOwnerProfileFields({ ownerType, mobile, editOwner }: Props) {
  const owner = editOwner?.owner
  const account = editOwner?.account
  const editing = Boolean(editOwner)
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Owner profile" : "2. Owner profile"}</CardTitle>
          {editing ? <p className="text-sm text-muted-foreground">Changes to legal identity and licence details may require national reverification.</p> : null}
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="owner_name">Owner / company name *</Label><Input id="owner_name" name="owner_name" defaultValue={owner?.owner_name ?? ""} required minLength={2} maxLength={180} /></div>
          <div className="space-y-2"><Label htmlFor="district">District</Label><Input id="district" name="district" defaultValue={owner?.district ?? ""} maxLength={100} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="registered_address">Registered address</Label><Textarea id="registered_address" name="registered_address" defaultValue={owner?.registered_address ?? ""} maxLength={1000} /></div>
          {ownerType === "individual" ? (
            <>
              <div className="space-y-2"><Label htmlFor="date_of_birth">Date of birth</Label><DdMmYyyyInput id="date_of_birth" name="date_of_birth" defaultValue={owner?.date_of_birth} /></div>
              <div className="space-y-2"><Label htmlFor="gender">Gender</Label><Input id="gender" name="gender" defaultValue={owner?.gender ?? ""} maxLength={30} /></div>
              <div className="space-y-2"><Label htmlFor="father_name">Father&apos;s name</Label><Input id="father_name" name="father_name" defaultValue={owner?.father_name ?? ""} maxLength={180} /></div>
              <div className="space-y-2"><Label htmlFor="mother_name">Mother&apos;s name</Label><Input id="mother_name" name="mother_name" defaultValue={owner?.mother_name ?? ""} maxLength={180} /></div>
            </>
          ) : (
            <>
              <div className="space-y-2"><Label htmlFor="company_registration_number">Company registration number</Label><Input id="company_registration_number" name="company_registration_number" defaultValue={owner?.identity_or_registration_reference ?? ""} readOnly={editing} aria-describedby={editing ? "company-id-note" : undefined} /></div>
              {editing ? <p id="company-id-note" className="text-xs text-muted-foreground">National registry identity is read-only here.</p> : null}
              <div className="space-y-2"><Label htmlFor="trade_license_number">Trade licence number</Label><Input id="trade_license_number" name="trade_license_number" defaultValue={owner?.trade_license_number ?? ""} maxLength={120} /></div>
              <div className="space-y-2"><Label htmlFor="company_type">Company type</Label><Input id="company_type" name="company_type" defaultValue={owner?.company_type ?? ""} maxLength={80} /></div>
              <div className="space-y-2"><Label htmlFor="incorporation_date">Incorporation date</Label><DdMmYyyyInput id="incorporation_date" name="incorporation_date" defaultValue={owner?.incorporation_date} /></div>
              <div className="space-y-2"><Label htmlFor="authorized_person_name">Authorized person</Label><Input id="authorized_person_name" name="authorized_person_name" defaultValue={owner?.authorized_person_name ?? ""} maxLength={180} /></div>
              <div className="space-y-2"><Label htmlFor="authorized_person_mobile">Authorized person mobile</Label><Input id="authorized_person_mobile" name="authorized_person_mobile" defaultValue={owner?.authorized_person_mobile ?? ""} type="tel" maxLength={30} /></div>
            </>
          )}
          <div className="space-y-2"><Label htmlFor="website_url">Website</Label><Input id="website_url" name="website_url" defaultValue={owner?.website_url ?? ""} type="url" maxLength={500} /></div>
          {editing && ownerType === "company" ? (
            <>
              <div className="space-y-2"><Label htmlFor="tin_number">TIN</Label><Input id="tin_number" name="tin_number" defaultValue={owner?.tin_number ?? ""} maxLength={80} /></div>
              <div className="space-y-2"><Label htmlFor="bin_number">BIN</Label><Input id="bin_number" name="bin_number" defaultValue={owner?.bin_number ?? ""} maxLength={80} /></div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Login account" : "3. Login account"}</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            {editing ? "Account changes are separate from password recovery. Reset passwords from the owner's details page." : "A username lets the owner sign in. Mobile and email are additional login identifiers."}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="contact_name">Account holder name *</Label><Input id="contact_name" name="contact_name" defaultValue={account?.display_name ?? owner?.owner_name ?? ""} required minLength={2} maxLength={180} disabled={editing && !account} /></div>
          <div className="space-y-2"><Label htmlFor="owner-mobile-display">Registered mobile</Label><Input id="owner-mobile-display" value={mobile} disabled /></div>
          {editing && account ? <div className="space-y-2"><Label htmlFor="edit_mobile">Login mobile</Label><Input id="edit_mobile" name="mobile" type="tel" defaultValue={account.mobile ?? owner?.phone ?? ""} maxLength={30} /></div> : null}
          <div className="space-y-2"><Label htmlFor="email">Login email (optional)</Label><Input id="email" name="email" type="email" defaultValue={account?.email ?? owner?.email ?? ""} disabled={editing && !account} /></div>
          <div className="space-y-2"><Label htmlFor="login_username">Login username {editing ? "" : "*"}</Label><Input id="login_username" name="login_username" defaultValue={account?.username ?? owner?.account_username ?? ""} minLength={3} required={!editing} disabled={editing && !account} /></div>
          {!editing ? <div className="space-y-2"><Label htmlFor="temporary_password">Temporary password (optional)</Label><Input id="temporary_password" name="temporary_password" type="password" minLength={6} autoComplete="new-password" /></div> : null}
        </CardContent>
      </Card>
    </>
  )
}
