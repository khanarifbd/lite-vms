import { ArrowLeft, Building2, UserRound } from "lucide-react"
import Link from "next/link"

import { OwnerReviewManager } from "@/components/super-admin/owner-review-manager"
import { TemporaryPasswordResetCard } from "@/components/super-admin/temporary-password-reset-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getAdminOwner } from "@/features/super-admin/owner-review"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ ownerId: string }> }

export default async function SuperAdminOwnerDetailsPage({ params }: Props) {
  const { ownerId } = await params
  const detail = await getAdminOwner(ownerId)
  const { owner } = detail
  const Icon = owner.owner_type === "company" ? Building2 : UserRound

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">Owner review · {owner.owner_code}</Badge>
              <div className="mt-5 flex items-center gap-3"><Icon className="size-8 text-emerald-200" /><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{owner.owner_name}</h1></div>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">Review the {owner.owner_type} application, full profile, documents, vehicles, connected providers, and account state.</p>
            </div>
            <Button asChild variant="secondary"><Link href="/super-admin/owners"><ArrowLeft /> Owner registry</Link></Button>
          </div>
        </section>

        <OwnerReviewManager detail={detail} />
        <TemporaryPasswordResetCard entityType="owner" entityId={owner.id} accountName={owner.owner_name} />
      </div>
    </div>
  )
}
