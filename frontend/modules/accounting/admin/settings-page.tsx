import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./settings-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
