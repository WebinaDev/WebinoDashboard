import type { ResolvedAdminRoute } from "@/kernel/types"

import PosSettingsPageClient from "./pos-settings-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PosSettingsPageClient route={route} />
}
