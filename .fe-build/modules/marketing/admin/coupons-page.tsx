import type { ResolvedAdminRoute } from "@/kernel/types"

import CouponsPageClient from "./coupons-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <CouponsPageClient route={route} />
}
