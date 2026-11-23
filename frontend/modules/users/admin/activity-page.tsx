import type { ResolvedAdminRoute } from "@/kernel/types"

import ActivityPageClient from "./activity-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ActivityPageClient route={route} />
}
