import type { ResolvedAdminRoute } from "@/kernel/types"

import PosPayLinkPageClient from "./pos-pay-link-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PosPayLinkPageClient route={route} />
}
