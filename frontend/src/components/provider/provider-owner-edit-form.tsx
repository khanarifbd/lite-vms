"use client"

import { ArrowLeft, Loader2, Save } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

import { ProviderOwnerProfileFields } from "@/components/provider/provider-owner-profile-fields"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { readOptionalDdMmYyyyIso } from "@/components/ui/date-input"
import type { ProviderOwnerCustomer } from "@/features/provider/owner-types"

function text(data: FormData, key: string) {
  return String(data.get(key) || "").trim()
}

export function ProviderOwnerEditForm({ customer }: { customer: ProviderOwnerCustomer }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const owner = customer.owner
  const account = customer.account
  const href = `/provider/owners/${owner.id}`

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const changes: Record<string, string | null> = {}
    const changed = (field: string, value: string | null, previous: string | null | undefined) => {
      if (value !== (previous || null)) changes[field] = value
    }
    try {
      changed("owner_name", text(data, "owner_name"), owner.owner_name)
      changed("registered_address", text(data, "registered_address") || null, owner.registered_address)
      changed("district", text(data, "district") || null, owner.district)
      changed("website_url", text(data, "website_url") || null, owner.website_url)
      if (owner.owner_type === "individual") {
        changed("date_of_birth", readOptionalDdMmYyyyIso(data, "date_of_birth", "Date of birth"), owner.date_of_birth)
        for (const field of ["gender", "father_name", "mother_name"] as const) {
          changed(field, text(data, field) || null, owner[field])
        }
      } else {
        changed("incorporation_date", readOptionalDdMmYyyyIso(data, "incorporation_date", "Incorporation date"), owner.incorporation_date)
        for (const field of [
          "trade_license_number", "company_type", "authorized_person_name",
          "authorized_person_mobile", "tin_number", "bin_number",
        ] as const) {
          changed(field, text(data, field) || null, owner[field])
        }
      }
      if (account) {
        changed("display_name", text(data, "contact_name"), account.display_name)
        for (const field of ["email", "mobile"] as const) {
          const next = text(data, field === "mobile" ? "mobile" : field)
          // Existing login identifiers cannot be cleared in this workflow.
          if (next) changed(field, next, account[field])
        }
        const username = text(data, "login_username")
        if (username) changed("username", username, account.username)
      }
      if (!Object.keys(changes).length) {
        setError("No changes to save.")
        return
      }

      setSaving(true)
      setError(null)
      const response = await fetch(`/api/provider/owners/${owner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      })
      const result = (await response.json().catch(() => null)) as
        | { message?: string; detail?: string; reverification_required?: boolean }
        | null
      if (!response.ok) {
        throw new Error(result?.message || result?.detail || "Unable to update the owner.")
      }
      router.push(`${href}?updated=${result?.reverification_required ? "review" : "1"}`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the owner.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-5">
      {error ? <Alert variant="destructive"><AlertTitle>Update not completed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <ProviderOwnerProfileFields
        ownerType={owner.owner_type}
        mobile={account?.mobile || owner.phone || ""}
        editOwner={customer}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild type="button" variant="outline"><Link href={href}><ArrowLeft /> Owner profile</Link></Button>
        <Button type="submit" disabled={saving} className="bg-emerald-800 text-white hover:bg-emerald-900">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  )
}
