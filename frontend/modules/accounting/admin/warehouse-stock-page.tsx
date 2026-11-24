import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./warehouse-stock-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
