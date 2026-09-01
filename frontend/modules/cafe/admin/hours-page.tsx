import type { ResolvedAdminRoute } from "@/kernel/types"

import HoursPageClient from "./hours-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <HoursPageClient route={route} />
}
