import type { ResolvedAdminRoute } from "@/kernel/types"

import DeliveryZonesPageClient from "./delivery-zones-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <DeliveryZonesPageClient route={route} />
}
