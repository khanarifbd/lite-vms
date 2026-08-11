import { ArrowLeft, Building2 } from "lucide-react"
import Link from "next/link"

import { ProviderReviewManager } from "@/components/super-admin/provider-review-manager"
import { TemporaryPasswordResetCard } from "@/components/super-admin/temporary-password-reset-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getAdminProvider } from "@/features/super-admin/provider-review"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ providerId: string }> }

export default async function SuperAdminProviderDetailsPage({ params }: Props) {
  const { providerId } = await params
  const detail = await getAdminProvider(providerId)
  const { provider } = detail

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">Provider review · {provider.code}</Badge>
              <div className="mt-5 flex items-center gap-3"><Building2 className="size-8 text-emerald-200" /><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{provider.legal_name}</h1></div>
              <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">Review the application, documents, operational footprint, integration readiness, connected owners, and account state.</p>
            </div>
            <Button asChild variant="secondary"><Link href="/super-admin/providers"><ArrowLeft /> Provider registry</Link></Button>
          </div>
        </section>

        <ProviderReviewManager detail={detail} />
        <TemporaryPasswordResetCard entityType="provider" entityId={provider.id} accountName={provider.legal_name} />
      </div>
    </div>
  )
}
