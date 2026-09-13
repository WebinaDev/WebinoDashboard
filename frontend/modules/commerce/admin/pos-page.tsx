import type { ResolvedAdminRoute } from "@/kernel/types"

import PosPageClient from "./pos-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PosPageClient route={route} />
}
