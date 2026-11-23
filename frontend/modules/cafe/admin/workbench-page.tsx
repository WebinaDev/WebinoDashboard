import type { ResolvedAdminRoute } from "@/kernel/types"

import WorkbenchPageClient from "./workbench-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <WorkbenchPageClient route={route} />
}
