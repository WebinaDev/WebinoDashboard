import type { ResolvedAdminRoute } from "@/kernel/types"

import AmendmentsPageClient from "./amendments-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <AmendmentsPageClient route={route} />
}
