import { Badge } from "@/components/ui/badge"
import { ProviderOwnerMobileRegistrationForm } from "@/components/provider/provider-owner-mobile-registration-form"

export const dynamic = "force-dynamic"

export default function ProviderOwnerRegisterPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
          <div className="relative max-w-3xl">
            <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
              Mobile-first owner onboarding
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Register a vehicle owner
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
              Search by mobile number, create the owner profile when it does not exist, and automatically link the owner to your company. The same mobile number becomes the default Primary login identifier.
            </p>
          </div>
        </section>

        <ProviderOwnerMobileRegistrationForm />
      </div>
    </div>
  )
}
