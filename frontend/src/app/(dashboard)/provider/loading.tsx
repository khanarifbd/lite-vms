import { ProviderPageLoading } from "@/components/provider/provider-page-loading"

// Applies to every provider child route unless that route defines its own fallback.
export default function Loading() {
  return <ProviderPageLoading />
}
