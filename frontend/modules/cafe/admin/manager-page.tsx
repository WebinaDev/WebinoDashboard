import type { ResolvedAdminRoute } from "@/kernel/types"

import ManagerPageClient from "./manager-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ManagerPageClient route={route} />
}
