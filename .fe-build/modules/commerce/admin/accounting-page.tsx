import type { ResolvedAdminRoute } from "@/kernel/types"

import AccountingPageClient from "./accounting-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <AccountingPageClient route={route} />
}
