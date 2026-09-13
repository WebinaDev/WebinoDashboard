import type { ResolvedAdminRoute } from "@/kernel/types"

import C2cReceiptsPageClient from "./c2c-receipts-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <C2cReceiptsPageClient route={route} />
}
