import type { ResolvedSiteRoute } from "@/kernel/types"

import OrderPayPageClient from "./order-pay-page-client"

export const revalidate = 0

type Props = {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}

export default function OrderPaySitePage({ route, searchParams }: Props) {
  return <OrderPayPageClient route={route} searchParams={searchParams ?? {}} />
}
