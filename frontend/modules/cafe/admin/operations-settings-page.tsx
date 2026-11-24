import type { ResolvedAdminRoute } from "@/kernel/types"

import OperationsSettingsPageClient from "./operations-settings-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <OperationsSettingsPageClient route={route} />
}
