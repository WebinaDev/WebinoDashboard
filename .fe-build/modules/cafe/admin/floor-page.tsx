import type { ResolvedAdminRoute } from "@/kernel/types"

import FloorPageClient from "./floor-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <FloorPageClient route={route} />
}
