import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./account-reviews-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
