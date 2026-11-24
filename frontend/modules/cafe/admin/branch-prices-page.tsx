import type { ResolvedAdminRoute } from "@/kernel/types"

import BranchPricesPageClient from "./branch-prices-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <BranchPricesPageClient route={route} />
}
