import type { ResolvedAdminRoute } from "@/kernel/types"

import OrderComposerPageClient from "./order-composer-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <OrderComposerPageClient route={route} />
}
