import type { ResolvedAdminRoute } from "@/kernel/types"

import ReportsPageClient from "./reports-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ReportsPageClient route={route} />
}
