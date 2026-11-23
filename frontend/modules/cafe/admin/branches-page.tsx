import type { ResolvedAdminRoute } from "@/kernel/types"

import BranchSettingsPageClient from "./branches-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <BranchSettingsPageClient route={route} />
}
