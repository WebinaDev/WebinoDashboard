import type { ResolvedAdminRoute } from "@/kernel/types"

import PricingPageClient from "./pricing-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PricingPageClient route={route} />
}
