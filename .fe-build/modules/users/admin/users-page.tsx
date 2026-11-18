import type { ResolvedAdminRoute } from "@/kernel/types"

import UsersPageClient from "./users-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <UsersPageClient route={route} />
}
