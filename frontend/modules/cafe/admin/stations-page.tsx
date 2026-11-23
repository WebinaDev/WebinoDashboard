import type { ResolvedAdminRoute } from "@/kernel/types"

import StationsPageClient from "./stations-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <StationsPageClient route={route} />
}
