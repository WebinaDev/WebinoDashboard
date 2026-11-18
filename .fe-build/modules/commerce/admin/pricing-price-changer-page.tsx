import type { ResolvedAdminRoute } from "@/kernel/types"

import PricingPriceChangerPageClient from "./pricing-price-changer-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PricingPriceChangerPageClient route={route} />
}
