import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./order-board-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
