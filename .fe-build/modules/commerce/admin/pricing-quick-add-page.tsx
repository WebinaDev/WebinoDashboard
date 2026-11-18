import type { ResolvedAdminRoute } from "@/kernel/types"

import PricingQuickAddPageClient from "./pricing-quick-add-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PricingQuickAddPageClient route={route} />
}
