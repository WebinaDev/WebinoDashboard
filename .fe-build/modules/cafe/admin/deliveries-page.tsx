import type { ResolvedAdminRoute } from "@/kernel/types"

import DeliveriesPageClient from "./deliveries-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <DeliveriesPageClient route={route} />
}
