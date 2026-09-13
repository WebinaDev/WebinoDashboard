import type { ResolvedAdminRoute } from "@/kernel/types"

import OrderDetailPageClient from "./order-detail-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <OrderDetailPageClient route={route} />
}
