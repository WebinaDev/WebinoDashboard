import type { ResolvedAdminRoute } from "@/kernel/types"

import CouponBuilderPageClient from "./coupon-builder-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <CouponBuilderPageClient route={route} />
}
