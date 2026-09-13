import type { ResolvedAdminRoute } from "@/kernel/types"

import CouponEditorPageClient from "./coupon-editor-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <CouponEditorPageClient route={route} />
}
