import type { ResolvedAdminRoute } from "@/kernel/types"

import StaffPageClient from "./staff-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <StaffPageClient route={route} />
}
