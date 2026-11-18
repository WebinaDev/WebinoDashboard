import type { ResolvedAdminRoute } from "@/kernel/types"

import OrdersPageClient from "./orders-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <OrdersPageClient route={route} />
}
