import type { ResolvedAdminRoute } from "@/kernel/types"

import UsersDetailPageClient from "./users-detail-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <UsersDetailPageClient route={route} />
}
